import { createMollieClient } from '@mollie/api-client';
import { AutoEncoder, BooleanDecoder,Decoder,field } from '@simonbackx/simple-encoding';
import { DecodedRequest, Endpoint, Request, Response } from "@simonbackx/simple-endpoints";
import { SimpleError } from "@simonbackx/simple-errors";
import { Group, Member, STPendingInvoice } from '@stamhoofd/models';
import { MolliePayment } from '@stamhoofd/models';
import { MollieToken } from '@stamhoofd/models';
import { Order } from '@stamhoofd/models';
import { Organization } from '@stamhoofd/models';
import { PayconiqPayment } from '@stamhoofd/models';
import { Payment } from '@stamhoofd/models';
import { QueueHandler } from '@stamhoofd/queues';
import { Payment as PaymentStruct, PaymentMethodHelper, PaymentProvider, PaymentStatus, STInvoiceItem } from "@stamhoofd/structures";

import { BuckarooHelper } from '../helpers/BuckarooHelper';
import { GetPaymentRegistrations } from './GetPaymentRegistrations';
type Params = {id: string};
class Query extends AutoEncoder {
    @field({ decoder: BooleanDecoder, optional: true })
    exchange = false
}
type Body = undefined
type ResponseBody = PaymentStruct | undefined;

/**
 * One endpoint to create, patch and delete groups. Usefull because on organization setup, we need to create multiple groups at once. Also, sometimes we need to link values and update multiple groups at once
 */

export class ExchangePaymentEndpoint extends Endpoint<Params, Query, Body, ResponseBody> {
    queryDecoder = Query as Decoder<Query>

    protected doesMatch(request: Request): [true, Params] | [false] {
        if (request.method != "POST") {
            return [false];
        }

        const params = Endpoint.parseParameters(request.url, "/payments/@id", {id: String});

        if (params) {
            return [true, params as Params];
        }
        return [false];
    }

    async handle(request: DecodedRequest<Params, Query, Body>) {
        // Return registrations for old versions (this endpoint has been moved)
        // Not for exchange, since payment processing needs to happen still
        if (request.request.getVersion() < 19 && !request.query.exchange) {
            // todo: also process payments in frontend
            return new GetPaymentRegistrations().handle(request as any)
        }

        const organization = await Organization.fromApiHost(request.host);
        
        // Not method on payment because circular references (not supprted in ts)
        const payment = await ExchangePaymentEndpoint.pollStatus(request.params.id, organization)
        if (!payment) {
            throw new SimpleError({
                code: "",
                message: "Deze link is ongeldig"
            })
        }

        if (request.query.exchange) {
            return new Response(undefined);
        }
        
        return new Response( 
            PaymentStruct.create({
                id: payment.id,
                method: payment.method,
                provider: payment.provider,
                status: payment.status,
                price: payment.price,
                transferDescription: payment.transferDescription,
                paidAt: payment.paidAt,
                createdAt: payment.createdAt,
                updatedAt: payment.updatedAt
            })
        );
    }

    private static async handlePaymentStatusUpdate(payment: Payment, organization: Organization, status: PaymentStatus) {
        const wasPaid = payment.paidAt !== null
        if (status == PaymentStatus.Succeeded) {
            payment.status = PaymentStatus.Succeeded
            payment.paidAt = new Date()

            // if it has registrations
            const registrations = await Member.getRegistrationWithMembersForPayment(payment.id)

            // if it has orders
            const order = registrations.length > 0 ? undefined : await Order.getForPayment(organization.id, payment.id)
            let updateGroups = false;

            for (const registration of registrations) {
                if (registration.registeredAt === null) {
                    registration.registeredAt = new Date()
                    registration.reservedUntil = null
                    await registration.save();
                    updateGroups = true;
                }
            }

            if (updateGroups) {
                const groups = await Group.getAll(organization.id, false)
                for (const group of groups) {
                    if (registrations.find(p => p.groupId === group.id)) {
                        await group.updateOccupancy()
                        await group.save()
                    }
                }
            }

            if (order) {
                await order.markPaid(payment, organization)
            }

            await payment.save();

            if (!wasPaid && payment.provider === PaymentProvider.Buckaroo && payment.method) {
                // Charge transaction fees
                const transactionFee = 25
                const name = "Transactiekosten voor "+PaymentMethodHelper.getName(payment.method)
                const item = STInvoiceItem.create({
                    name,
                    description: "Via Buckaroo",
                    amount: 1,
                    unitPrice: transactionFee,
                    canUseCredits: false
                })
                console.log("Scheduling transaction fee charge for ", payment.id, item)
                await QueueHandler.schedule("billing/invoices-"+organization.id, async () => {
                    await STPendingInvoice.addItems(organization, [item])
                });
            }
        } else if (status == PaymentStatus.Failed) {
            const order = await Order.getForPayment(organization.id, payment.id)
            await order?.onPaymentFailed()
            payment.status = PaymentStatus.Failed
            await payment.save();
        } else {
            payment.status = status
            await payment.save();
        }
    }

    /**
     * ID of payment is needed because of race conditions (need to fetch payment in a race condition save queue)
     */
    static async pollStatus(paymentId: string, organization: Organization): Promise<Payment | undefined> {
        // Prevent polling the same payment multiple times at the same time: create a queue to prevent races
        return await QueueHandler.schedule("payments/"+paymentId, async () => {
            // Get a new copy of the payment (is required to prevent concurreny bugs)
            const payment = await Payment.getByID(paymentId)
            if (!payment) {
                return
            }

            if (payment.status == PaymentStatus.Pending || payment.status == PaymentStatus.Created) {
                
                if (payment.provider === PaymentProvider.Mollie) {
                    // check status via mollie
                    const molliePayments = await MolliePayment.where({ paymentId: payment.id}, { limit: 1 })
                    if (molliePayments.length == 1) {
                        const molliePayment = molliePayments[0]
                        // check status
                        const token = await MollieToken.getTokenFor(organization.id)
                        
                        if (token) {
                            const mollieClient = createMollieClient({ accessToken: await token.getAccessToken() });
                            const mollieData = await mollieClient.payments.get(molliePayment.mollieId, {
                                testmode: organization.privateMeta.useTestPayments ?? STAMHOOFD.environment != 'production',
                            })

                            console.log(mollieData) // log to log files to check issues

                            const details = (mollieData.details as any) 
                            if (details?.consumerName) {
                                payment.ibanName = details.consumerName
                            }
                            if (details?.consumerAccount) {
                                payment.iban = details.consumerAccount
                            }
                            if (details?.cardHolder) {
                                payment.ibanName = details.cardHolder
                            }
                            if (details?.cardNumber) {
                                payment.iban = "xxxx xxxx xxxx "+details.cardNumber
                            }

                            if (mollieData.status == "paid") {
                                await this.handlePaymentStatusUpdate(payment, organization, PaymentStatus.Succeeded)
                            } else if (mollieData.status == "failed" || mollieData.status == "expired" || mollieData.status == "canceled") {
                                await this.handlePaymentStatusUpdate(payment, organization, PaymentStatus.Failed)
                            }
                        } else {
                            console.warn("Mollie payment is missing for organization "+organization.id+" while checking payment status...")
                        }
                    }
                } else if (payment.provider == PaymentProvider.Buckaroo) {
                    const helper = new BuckarooHelper(organization.privateMeta.buckarooSettings?.key ?? "", organization.privateMeta.buckarooSettings?.secret ?? "", organization.privateMeta.useTestPayments ?? STAMHOOFD.environment != 'production')
                    const status = await helper.getStatus(payment)
                    await this.handlePaymentStatusUpdate(payment, organization, status)
                } else if (payment.provider == PaymentProvider.Payconiq) {
                    // Check status

                    const payconiqPayments = await PayconiqPayment.where({ paymentId: payment.id}, { limit: 1 })
                    if (payconiqPayments.length == 1) {
                        const payconiqPayment = payconiqPayments[0]

                        const status = await payconiqPayment.getStatus(organization)
                        await this.handlePaymentStatusUpdate(payment, organization, status)
                        
                    } else {
                        console.warn("Payconiq payment is missing for organization "+organization.id+" while checking payment status...")
                    }
                }
            }
            return payment
        })
    }
}
