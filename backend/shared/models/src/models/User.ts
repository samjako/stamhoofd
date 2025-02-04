import { column, Database, ManyToOneRelation, Model } from "@simonbackx/simple-database";
import { Sodium } from '@stamhoofd/crypto';
import { KeyConstants, NewUser,Organization as OrganizationStruct,Permissions } from "@stamhoofd/structures"
import { v4 as uuidv4 } from "uuid";

import { KeychainItem } from './KeychainItem';
import { Organization } from "./Organization";

export type UserWithOrganization = User & { organization: Organization };
export type UserForAuthentication = User & { publicAuthSignKey: string; authSignKeyConstants: KeyConstants; authEncryptionKeyConstants: KeyConstants };
export type UserFull = User & { publicKey: string; publicAuthSignKey: string; authEncryptionKeyConstants: KeyConstants; authSignKeyConstants: KeyConstants; encryptedPrivateKey: string };

export class User extends Model {
    static table = "users";

    // Columns
    @column({
        primary: true, type: "string", beforeSave(value) {
            return value ?? uuidv4();
        }
    })
    id!: string;

    @column({ foreignKey: User.organization, type: "string" })
    organizationId: string;

    @column({ type: "string", nullable: true })
    firstName: string | null = null;

    @column({ type: "string", nullable: true })
    lastName: string | null = null;

    @column({ type: "string" })
    email: string;

    @column({ type: "boolean" })
    verified = false

    /**
     * Set to true when the user forgot (and reset!) its password or when a new user is created in a family
     * When this is true, the organization will be able to reprovide the user with new keys in the UI
     */
    @column({ type: "boolean" })
    requestKeys = false

    /**
     * Public key used for encryption
     */
    @column({ type: "string", nullable: true })
    publicKey: string | null = null;

    /**
     * Public key used for encryption
     */
    @column({ type: "json", decoder: Permissions, nullable: true })
    permissions: Permissions | null = null

    /**
     * public key that is used to verify during login (using a challenge) and for getting a token
     * SHOULD NEVER BE PUBLIC!
     */
    @column({ type: "string", nullable: true })
    protected publicAuthSignKey?: string | null = null // if not selected will be undefined

    /**
     * Encrypted private key, used for authenticated encrytion and decryption
     */
    @column({ type: "string", nullable: true })
    protected encryptedPrivateKey: string | null = null // if not selected will be undefined

    /**
     * Constants that are used to get the authSignKeyPair from the user password. Using
     */
    @column({ type: "json", decoder: KeyConstants, nullable: true })
    protected authSignKeyConstants?: KeyConstants | null = null // if not selected will be undefined

    /**
     * Constants that are used to get the authEncryptionKey from the user password. Only accessible for the user using his token (= after login)
     */
    @column({ type: "json", decoder: KeyConstants, nullable: true })
    protected authEncryptionKeyConstants: KeyConstants | null = null // if not selected will be undefined


    @column({
        type: "datetime", beforeSave(old?: any) {
            if (old !== undefined) {
                return old;
            }
            const date = new Date()
            date.setMilliseconds(0)
            return date
        }
    })
    createdAt: Date

    @column({
        type: "datetime", beforeSave() {
            const date = new Date()
            date.setMilliseconds(0)
            return date
        },
        skipUpdate: true
    })
    updatedAt: Date

    static organization = new ManyToOneRelation(Organization, "organization");

    /// Delete users when we delete a member
    static async deleteForDeletedMember(memberId: string) {
        const [rows] = await Database.delete(`DELETE ${this.table} FROM ${this.table} JOIN _members_users a ON a.usersId = ${this.table}.id LEFT JOIN _members_users b ON b.usersId = ${this.table}.id AND b.membersId != a.membersId WHERE a.membersId = ? and b.membersId is null and users.permissions is null`, [memberId]);
        return rows
    }

    /**
     * @param namespace
     * @override
     */
    static getDefaultSelect(namespace?: string): string {
        return this.selectColumnsWithout(namespace, "encryptedPrivateKey", "publicAuthSignKey", "authSignKeyConstants", "authEncryptionKeyConstants");
    }

    static async getFull(id: string): Promise<UserFull | undefined> {
        const [rows] = await Database.select(`SELECT * FROM ${this.table} WHERE \`id\` = ? LIMIT 1`, [id]);

        if (rows.length == 0) {
            return undefined;
        }

        // Read member + address from first row
        const user = this.fromRow(rows[0][this.table]) 

        if (!user || !user.hasKeys()) {
            return undefined
        }
        
        return user as UserFull;
    }

    hasAccount() {
        if (this.publicKey === null) {
            // This is a placeholder user
            return false
        }
        return true
    }

    protected hasKeys() {
        if (this.publicKey === null) {
            // This is a placeholder user
            return false
        }

        if (this.authSignKeyConstants === null) {
            console.error(this.id+": authSignKeyConstants is null")
            // This is a placeholder user
            return false
        }
        
        if (this.publicAuthSignKey === null) {
            console.error(this.id+": publicAuthSignKey is null")
            // This is a placeholder user
            return false
        }

        if (this.authEncryptionKeyConstants === null) {
            console.error(this.id+": authEncryptionKeyConstants is null")
            // This is a placeholder user
            return false
        }

        if (this.encryptedPrivateKey === null) {
            console.error(this.id+": encryptedPrivateKey is null")
            // This is a placeholder user
            return false
        }
        return true
    }

    static async getForRegister(organization: Organization, email: string): Promise<UserWithOrganization | undefined> {
        const [rows] = await Database.select(`SELECT * FROM ${this.table} WHERE \`email\` = ? AND organizationId = ? LIMIT 1`, [email, organization.id]);

        if (rows.length == 0) {
            return undefined;
        }
        const user = this.fromRow(rows[0][this.table])

        if (!user) {
            return undefined
        }

        // Read member + address from first row
        return user.setRelation(User.organization, organization);
    }

    static async getForAuthentication(organizationId: string, email: string): Promise<UserForAuthentication | undefined> {
        const [rows] = await Database.select(`SELECT * FROM ${this.table} WHERE \`email\` = ? AND organizationId = ? LIMIT 1`, [email, organizationId]);

        if (rows.length == 0) {
            return undefined;
        }
        const user = this.fromRow(rows[0][this.table])

        if (!user || !user.hasKeys()) {
            return undefined
        }

        // Read member + address from first row
        return user as UserForAuthentication;
    }

    static async register(
        organization: Organization,
        data: NewUser
    ): Promise<UserWithOrganization | undefined> {
        const {
            email,
            publicKey,
            publicAuthSignKey,
            encryptedPrivateKey,
            authSignKeyConstants,
            authEncryptionKeyConstants,
            id,
            firstName,
            lastName
        } = data;

        if (publicKey === null) {
            throw new Error("A publicKey is required for new users")
        }

        const user = new User().setRelation(User.organization, organization);
        user.id = id ?? uuidv4()
        user.email = email;
        user.publicKey = publicKey;
        user.publicAuthSignKey = publicAuthSignKey
        user.encryptedPrivateKey = encryptedPrivateKey
        user.authSignKeyConstants = authSignKeyConstants
        user.authEncryptionKeyConstants = authEncryptionKeyConstants
        user.verified = false;
        user.firstName = firstName
        user.lastName = lastName

        try {
            await user.save();
        } catch (e) {
            // Duplicate key probably
            if (e.code && e.code == "ER_DUP_ENTRY") {
                return;
            }
            throw e;
        }

        // Remove from memory and avoid accidental leaking
        user.eraseProperty("publicAuthSignKey");
        user.eraseProperty("encryptedPrivateKey");
        user.eraseProperty("authSignKeyConstants");
        user.eraseProperty("authEncryptionKeyConstants");
        return user;
    }

    async changePassword(data: { publicKey?: string; publicAuthSignKey: string; encryptedPrivateKey: string; authSignKeyConstants: KeyConstants; authEncryptionKeyConstants: KeyConstants }) {
        const {
            publicKey,
            publicAuthSignKey,
            encryptedPrivateKey,
            authSignKeyConstants,
            authEncryptionKeyConstants
        } = data;

        if (publicKey && this.publicKey != publicKey) {
            // Delete keychain!
            // First print it to console.error as a temporary backup
            const keychainItems = await KeychainItem.where({ userId: this.id })
            console.error("Backup keychain items because publicKey was changed:")
            console.error("old: "+this.publicKey)
            console.error("new: "+publicKey)
            console.error(JSON.stringify(keychainItems, undefined, 4))
            const query = "DELETE FROM `"+KeychainItem.table+"` where userId = ?"
            await Database.delete(query, [this.id])
        }

        this.publicKey = publicKey ?? this.publicKey
        this.publicAuthSignKey = publicAuthSignKey
        this.encryptedPrivateKey = encryptedPrivateKey
        this.authSignKeyConstants = authSignKeyConstants
        this.authEncryptionKeyConstants = authEncryptionKeyConstants

        // todo: Send a security e-mail
    }

    getAuthSignKeyConstants(this: UserForAuthentication): KeyConstants {
        return this.authSignKeyConstants
    }

    async verifyAuthSignature(this: UserForAuthentication, signature: string, message: string) {
        return await Sodium.verifySignature(signature, message, this.publicAuthSignKey)
    }

    async getOrganizatonStructure(organization: Organization): Promise<OrganizationStruct> {
        if (organization.id != this.organizationId) {
            throw new Error("Unexpected permission failure")
        }
        return this.permissions ? await organization.getPrivateStructure(this.permissions) : await organization.getStructure()
    }

    getEmailTo() {
        return this.firstName && this.lastName ? ('"'+(this.firstName+" "+this.lastName).replace("\"", "\\\"")+"\" <"+this.email+">") 
        : (
            this.firstName ? ('"'+this.firstName.replace("\"", "\\\"")+"\" <"+this.email+">") 
            : this.email
        )
    }

}
