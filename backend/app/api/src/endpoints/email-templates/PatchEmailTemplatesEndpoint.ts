import { AutoEncoderPatchType, Decoder, PatchableArrayAutoEncoder, PatchableArrayDecoder, StringDecoder } from '@simonbackx/simple-encoding';
import { DecodedRequest, Endpoint, Request, Response } from "@simonbackx/simple-endpoints";
import { SimpleError } from '@simonbackx/simple-errors';
import { EmailTemplate, Token, UserWithOrganization, Webshop } from '@stamhoofd/models';
import { EmailTemplate as EmailTemplateStruct, getPermissionLevelNumber, PermissionLevel } from '@stamhoofd/structures';

type Params = Record<string, never>;
type Body = PatchableArrayAutoEncoder<EmailTemplateStruct>;
type Query = undefined;

type ResponseBody = EmailTemplateStruct[];

export class PatchEmailTemplatesEndpoint extends Endpoint<Params, Query, Body, ResponseBody> {
    bodyDecoder = new PatchableArrayDecoder(EmailTemplateStruct as Decoder<EmailTemplateStruct>, EmailTemplateStruct.patchType() as Decoder<AutoEncoderPatchType<EmailTemplateStruct>>, StringDecoder)

    protected doesMatch(request: Request): [true, Params] | [false] {
        if (request.method != "PATCH") {
            return [false];
        }

        const params = Endpoint.parseParameters(request.url, "/email-templates", {});

        if (params) {
            return [true, params as Params];
        }
        return [false];
    }

    async handle(request: DecodedRequest<Params, Query, Body>) {
        const token = await Token.authenticate(request);
        const user = token.user

        if (!user.permissions) {
            throw new SimpleError({
                code: "permission_denied",
                message: "You do not have permissions for this endpoint",
                statusCode: 403
            })
        }

        const templates: EmailTemplate[] = []

        // Get all patches
        for (const patch of request.body.getPatches()) {
            const template = await EmailTemplate.getByID(patch.id)
            if (!template || template.organizationId !== user.organizationId) {
                throw new SimpleError({
                    code: "invalid_template",
                    message: "Template with id "+patch.id+" not found",
                })
            }
            await this.checkTemplateWritePermission(template, user)
            
            template.html = patch.html ?? template.html
            template.subject = patch.subject ?? template.subject
            template.text = patch.text ?? template.text
            template.json = patch.json ?? template.json

            await template.save()

            templates.push(template)
        }

        for (const put of request.body.getPuts()) {
            const struct = put.put
            const template = new EmailTemplate()
            template.id = struct.id
            template.organizationId = user.organizationId
            template.webshopId = struct.webshopId
            template.groupId = struct.groupId

            template.html = struct.html
            template.subject = struct.subject
            template.text = struct.text
            template.json = struct.json

            template.type = struct.type

            // Check if valid + write permissions
            await this.checkTemplateWritePermission(template, user)
            await template.save()

            templates.push(template)
        }
        
        return new Response(templates.map(template => EmailTemplateStruct.create(template)))
    }

    async checkTemplateWritePermission(template: EmailTemplate, user: UserWithOrganization) {
        if (template.webshopId) {
            const webshop = await Webshop.getByID(template.webshopId)
            if (!webshop || webshop.organizationId !== user.organizationId || !user.permissions || getPermissionLevelNumber(webshop.privateMeta.permissions.getPermissionLevel(user.permissions)) < getPermissionLevelNumber(PermissionLevel.Write)) {
                throw new SimpleError({
                    code: "permission_denied",
                    message: "No permissions for this webshop",
                    human: "Je hebt geen toegang om bestellingen te bewerken van deze webshop",
                    statusCode: 403
                })
            }
        }

        if (template.groupId) {
            throw new SimpleError({
                code: "not_supported",
                message: "Group templates not yet supported",
                human: "Group templates not yet supported",
                statusCode: 400
            })
        }
    }

    
}