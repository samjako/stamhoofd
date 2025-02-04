import { ArrayDecoder, AutoEncoder, field, IntegerDecoder, ObjectData, PartialWithoutMethods, StringDecoder } from '@simonbackx/simple-encoding';
import { isSimpleError, isSimpleErrors, SimpleError, SimpleErrors } from '@simonbackx/simple-errors';
import { Formatter } from '@stamhoofd/utility';
import { v4 as uuidv4 } from "uuid";

import { Option, OptionMenu, Product, ProductPrice, ProductType } from './Product';
import { Webshop } from './Webshop';
import { WebshopFieldAnswer } from './WebshopField';

export class CartItemOption extends AutoEncoder {
    @field({ decoder: Option })
    option: Option;

    @field({ decoder: OptionMenu })
    optionMenu: OptionMenu;
}

export class CartItem extends AutoEncoder {
    @field({ decoder: StringDecoder, defaultValue: () => uuidv4(), version: 106, upgrade: function(this: CartItem) {
        // Warning: this id will always be too long for storage in a normal database record.
        // But that is not a problem, since only new orders will use tickets that need this field
        return this.code
    } })
    id: string;
    
    @field({ decoder: Product })
    product: Product;

    @field({ decoder: ProductPrice })
    productPrice: ProductPrice;
    
    @field({ decoder: new ArrayDecoder(CartItemOption) })
    options: CartItemOption[] = []

    @field({ decoder: new ArrayDecoder(WebshopFieldAnswer), version: 94 })
    fieldAnswers: WebshopFieldAnswer[] = []

    @field({ decoder: IntegerDecoder })
    amount = 1;

    /**
     * When an order is correctly placed, we store the reserved amount in the stock here.
     * We need this to check the stock changes when an order is edited after placement.
     */
    @field({ decoder: IntegerDecoder, version: 115 })
    reservedAmount = 0;

    /**
     * Saved unitPrice (migration needed)
     */
    @field({ decoder: IntegerDecoder, nullable: true, version: 107 })
    unitPrice: number | null = null;

    get price() {
        return this.unitPrice ? (this.unitPrice * this.amount) : null
    }

    static create<T extends typeof AutoEncoder>(this: T, object: PartialWithoutMethods<CartItem>): InstanceType<T>  {
        const c = super.create(object) as CartItem

        // Fill in all default options here
        for (const optionMenu of c.product.optionMenus) {
            if (optionMenu.multipleChoice) {
                continue;
            }

            if (c.options.find(o => o.optionMenu.id === optionMenu.id)) {
                continue
            }

            c.options.push(CartItemOption.create({
                option: optionMenu.options[0],
                optionMenu: optionMenu
            }))

        }

        return c as InstanceType<T>
    }

    /**
     * Unique identifier to check if two cart items are the same
     */
    get code(): string {
        return this.codeWithoutFields+"."+this.fieldAnswers.map(a => a.field.id+"-"+Formatter.slug(a.answer)).join(".");
    }


    get codeWithoutFields(): string {
        return this.product.id+"."+this.productPrice.id+"."+this.options.map(o => o.option.id).join(".")
    }

    /**
     * Return total amount of same product in the given cart. Always includes the current item, even when it isn't in the cart. Doesn't count it twice
     */
    getTotalAmount(cart: Cart) {
        return cart.items.reduce((c, item) => {
            if (item.product.id !== this.product.id) {
                return c
            }

            if (item.id === this.id) {
                return c
            }
            return c + item.amount
        }, 0) + this.amount
    }

    calculateUnitPrice(cart: Cart): number {
        const amount = this.getTotalAmount(cart)
        let price = this.productPrice.price

        if (this.productPrice.discountPrice !== null && amount >= this.productPrice.discountAmount) {
            price = this.productPrice.discountPrice
        }
        for (const option of this.options) {
            price += option.option.price
        }

        if (price >= 0) {
            this.unitPrice = Math.max(0, price)
        } else {
            // Allow negative
            this.unitPrice = price
        }
        return this.unitPrice
    }

    /**
     * Use this method if you need temporary prices in case it is not yet calculated
     */
    getUnitPrice(cart: Cart): number {
        if (this.unitPrice) {
            return this.unitPrice
        }
        return this.calculateUnitPrice(cart)
    }

    getPrice(cart: Cart): number {
        return this.getUnitPrice(cart) * this.amount
    }

    /**
     * Used for statistics
     */
    get descriptionWithoutFields(): string {
        const descriptions: string[] = []

        if (this.product.prices.length > 1) {
            descriptions.push(this.productPrice.name)
        }
        for (const option of this.options) {
            descriptions.push(option.option.name)
        }

        if ((this.product.type === ProductType.Ticket || this.product.type === ProductType.Voucher) && this.product.dateRange) {
            descriptions.unshift(Formatter.capitalizeFirstLetter(this.product.dateRange.toString()))
        }

        return descriptions.join("\n")
    }

    get descriptionWithoutDate(): string {
        const descriptions: string[] = []

        if (this.product.prices.length > 1) {
            descriptions.push(this.productPrice.name)
        }
        for (const option of this.options) {
            descriptions.push(option.option.name)
        }

        for (const a of this.fieldAnswers) {
            if (!a.answer) {
                continue
            }
            descriptions.push(a.field.name+": "+a.answer)
        }
        return descriptions.join("\n")
    }

    get description(): string {
        const descriptions: string[] = [this.descriptionWithoutDate]

        if ((this.product.type === ProductType.Ticket || this.product.type === ProductType.Voucher) && this.product.dateRange) {
            descriptions.unshift(Formatter.capitalizeFirstLetter(this.product.dateRange.toString()))
        }
        return descriptions.join("\n")
    }

    validateAnswers() {
        const newAnswers: WebshopFieldAnswer[] = []
        for (const field of this.product.customFields) {
            const answer = this.fieldAnswers.find(a => a.field.id === field.id)

            try {
                if (!answer) {
                    const a = WebshopFieldAnswer.create({ field, answer: "" })
                    a.validate()
                    newAnswers.push(a)
                } else {
                    answer.field = field
                    answer.validate()
                    newAnswers.push(answer)
                }
            } catch (e) {
                if (isSimpleError(e) || isSimpleErrors(e)) {
                    e.addNamespace("fieldAnswers."+field.id)
                }
                throw e
            }
            
        }
        this.fieldAnswers = newAnswers
    }

    /**
     * Update self to the newest available data, and throw error if something failed (only after refreshing other ones)
     */
    refresh(webshop: Webshop) {
        const errors = new SimpleErrors()
        const product = webshop.products.find(p => p.id == this.product.id)
        if (!product) {
            errors.addError(new SimpleError({
                code: "product_unavailable",
                message: "Product unavailable",
                human: this.product.name+" is niet meer beschikbaar"
            }))
        } else {
            this.product = product
            const productPrice = product.prices.find(p => p.id === this.productPrice.id)
            if (!productPrice) {
                if (this.productPrice.name.length == 0 || this.product.prices.length <= 1 && product.prices.length > 1) {
                    errors.addError(new SimpleError({
                        code: "product_price_unavailable",
                        message: "Product price unavailable",
                        human: "Er werden keuzemogelijkheden toegevoegd aan "+this.product.name+", waar je nu eerst moet uit kiezen."
                    }))
                } else {
                    errors.addError(new SimpleError({
                        code: "product_price_unavailable",
                        message: "Product price unavailable",
                        human: "De keuzemogelijkheid '"+this.productPrice.name+"' van "+this.product.name+" is niet meer beschikbaar. Kies een andere."
                    }))
                }
            } else {
                // Only set product if we did find our product price
                this.productPrice = productPrice
            }

            // Check all options
            const remainingMenus = this.product.optionMenus.slice()

            for (const o of this.options) {
                let index = remainingMenus.findIndex(m => m.id === o.optionMenu.id)
                if (index == -1) {
                    // Check if it has a multiple choice one
                    index = this.product.optionMenus.findIndex(m => m.id === o.optionMenu.id)
                    errors.addError(new SimpleError({
                        code: "option_menu_unavailable",
                        message: "Option menu unavailable",
                        human: "Eén of meerdere keuzemogelijkheden van "+this.product.name+" zijn niet meer beschikbaar"
                    }))
                    continue
                }

                const menu = remainingMenus[index]
                if (!menu.multipleChoice) {
                    // Already used: not possible to add another
                    remainingMenus.splice(index, 1)[0]
                }
                
                const option = menu.options.find(m => m.id === o.option.id)

                if (!option) {
                    errors.addError(new SimpleError({
                        code: "option_unavailable",
                        message: "Option unavailable",
                        human: "Eén of meerdere keuzemogelijkheden van "+this.product.name+" zijn niet meer beschikbaar"
                    }))
                    continue
                }

                // Update to latest data
                o.optionMenu = menu
                o.option = option
            }

            if (remainingMenus.filter(m => !m.multipleChoice).length > 0) {
                errors.addError(
                    new SimpleError({
                        code: "missing_menu",
                        message: "Missing menu's "+remainingMenus.filter(m => !m.multipleChoice).map(m => m.name).join(", "),
                        human: "Er zijn nieuwe keuzemogelijkheden voor "+this.product.name+" waaruit je moet kiezen"
                    })
                )
            }
        }

        try {
            this.validateAnswers()
        } catch (e) {
            errors.addError(e)
        }

        errors.throwIfNotEmpty()

    

    }

    /**
     * Update self to the newest available data and throw if it was not able to recover
     */
    validate(webshop: Webshop, cart: Cart, refresh = true) {
        if (refresh) {
            this.refresh(webshop)
        }

        // Check stock
        const product = this.product
        if (!product.enabled && this.amount > this.reservedAmount) {
            throw new SimpleError({
                code: "product_unavailable",
                message: "Product unavailable",
                human: this.product.name+" is niet meer beschikbaar"
            })
        }

        if (product.isSoldOut && this.amount > this.reservedAmount) {
            throw new SimpleError({
                code: "product_unavailable",
                message: "Product unavailable",
                human: this.product.name+" is uitverkocht"
            })
        }

        if (product.remainingStock !== null && product.remainingStock < this.amount - this.reservedAmount) {
            throw new SimpleError({
                code: "product_unavailable",
                message: "No remaining stock",
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                human: "Er zijn nog maar "+product.remainingStock+" stuks beschikbaar van "+this.product.name
            })
        }

        // Update prices
        this.calculateUnitPrice(cart)
    }

}

export class Cart extends AutoEncoder {
    @field({ decoder: new ArrayDecoder(CartItem) })
    items: CartItem[] = []

    addItem(item: CartItem) {
        if (item.amount === 0) {
            return
        }
        const c = item.code
        for (const i of this.items) {
            if (i.code === c) {
                i.amount += item.amount
                return
            }
        }
        this.items.push(item)
    }

    removeItem(item: CartItem) {
        const c = item.code
        for (const [index, i] of this.items.entries()) {
            if (i.code === c) {
                this.items.splice(index, 1)
                return
            }
        }
    }

    get price() {
        return Math.max(0, this.items.reduce((c, item) => c + item.getPrice(this), 0))
    }

    get count() {
        return this.items.reduce((c, item) => c + item.amount, 0)
    }

    get persons() {
        return this.items.reduce((sum, item) => sum + (item.product.type === ProductType.Person ? item.amount : 0), 0)
    }

    /**
     * Refresh all items with the newest data, throw if something failed (at the end)
     */
    refresh(webshop: Webshop) {
        const errors = new SimpleErrors()
        for (const item of this.items) {
            try {
                item.refresh(webshop)
            } catch (e) {
                errors.addError(e)
            }
        }

        errors.throwIfNotEmpty()
    }

    /**
     * Refresh all items with the newest data, throw if something failed (at the end)
     */
    updatePrices() {
        const errors = new SimpleErrors()
        for (const item of this.items) {
            try {
                item.calculateUnitPrice(this)
            } catch (e) {
                errors.addError(e)
            }
        }

        errors.throwIfNotEmpty()
    }

    validate(webshop: Webshop) {
        const newItems: CartItem[] = []
        const errors = new SimpleErrors()
        for (const item of this.items) {
            try {
                item.validate(webshop, this)
                newItems.push(item)
            } catch (e) {
                errors.addError(e)
            }
        }

        // todo: validate stock

        this.items = newItems
        errors.throwIfNotEmpty()
    }
}