import { column,Database,Model, OneToManyRelation } from '@simonbackx/simple-database';
import { GroupPrivateSettings, GroupSettings, Group as GroupStruct, Permissions, OrganizationMetaData } from '@stamhoofd/structures';
import { v4 as uuidv4 } from "uuid";

import { Member,MemberWithRegistrations } from './Member';
import { Payment } from './Payment';
import { Registration, RegistrationWithPayment } from './Registration';
import { User } from './User';

if (Member === undefined) {
    throw new Error("Import Member is undefined")
}
if (User === undefined) {
    throw new Error("Import User is undefined")
}
if (Payment === undefined) {
    throw new Error("Import Payment is undefined")
}
if (Registration === undefined) {
    throw new Error("Import Registration is undefined")
}
export class Group extends Model {
    static table = "groups";

    @column({
        primary: true, type: "string", beforeSave(value) {
            return value ?? uuidv4();
        }
    })
    id!: string;

    @column({ type: "json", decoder: GroupSettings })
    settings: GroupSettings;

    @column({ 
        type: "json", decoder: GroupPrivateSettings, beforeSave(value) {
            return value ?? GroupPrivateSettings.create({})
        } 
    })
    privateSettings: GroupPrivateSettings;

    @column({ type: "string" })
    organizationId: string;

    /**
     * Every time a new registration period starts, this number increases. This is used to mark all older registrations as 'out of date' automatically
     */
    @column({ type: "integer" })
    cycle = 0;

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

    @column({
        type: "datetime",
        nullable: true
    })
    deletedAt: Date | null = null

    static async getAll(organizationId: string, active = true) {
        if (active) {
            return await Group.where({ organizationId, deletedAt: null })
        }
        return await Group.where({ organizationId })
    }

    /**
     * Fetch all members with their corresponding (valid) registrations, users and payments
     */
    async getMembersWithRegistration(waitingList = false, cycleOffset = 0): Promise<MemberWithRegistrations[]> {
        let query = `SELECT ${Member.getDefaultSelect()}, ${Registration.getDefaultSelect()}, ${Payment.getDefaultSelect()}, ${User.getDefaultSelect()} from \`${Member.table}\`\n`;
        
        query += `JOIN \`${Registration.table}\` ON \`${Registration.table}\`.\`${Member.registrations.foreignKey}\` = \`${Member.table}\`.\`${Member.primary.name}\` AND (\`${Registration.table}\`.\`registeredAt\` is not null OR \`${Registration.table}\`.\`waitingList\` = 1)\n`

        if (waitingList) {
            query += `JOIN \`${Registration.table}\` as reg_filter ON reg_filter.\`${Member.registrations.foreignKey}\` = \`${Member.table}\`.\`${Member.primary.name}\` AND reg_filter.\`waitingList\` = 1\n`
        } else {
            query += `JOIN \`${Registration.table}\` as reg_filter ON reg_filter.\`${Member.registrations.foreignKey}\` = \`${Member.table}\`.\`${Member.primary.name}\` AND reg_filter.\`waitingList\` = 0 AND reg_filter.\`registeredAt\` is not null\n`
        }

        query += `LEFT JOIN \`${Payment.table}\` ON \`${Payment.table}\`.\`${Payment.primary.name}\` = \`${Registration.table}\`.\`${Registration.payment.foreignKey}\`\n`

        query += Member.users.joinQuery(Member.table, User.table)+"\n"

        // We do an extra join because we also need to get the other registrations of each member (only one regitration has to match the query)
        query += `where reg_filter.\`groupId\` = ? AND reg_filter.\`cycle\` = ?`

        const [results] = await Database.select(query, [this.id, this.cycle - cycleOffset])
        const members: MemberWithRegistrations[] = []

        for (const row of results) {
            const foundMember = Member.fromRow(row[Member.table])
            if (!foundMember) {
                throw new Error("Expected member in every row")
            }
            const _f = foundMember.setManyRelation(Member.registrations as unknown as OneToManyRelation<"registrations", Member, RegistrationWithPayment>, []).setManyRelation(Member.users, [])

            // Seach if we already got this member?
            const existingMember = members.find(m => m.id == _f.id)

            const member: MemberWithRegistrations = (existingMember ?? _f)
            if (!existingMember) {
                members.push(member)
            }

            // Check if we have a registration with a payment
            const registration = Registration.fromRow(row[Registration.table])
            if (registration) {
                // Check if we already have this registration
                if (!member.registrations.find(r => r.id == registration.id)) {
                    const payment = Payment.fromRow(row[Payment.table]) ?? null
                    // Every registration should have a valid payment (unless they are on the waiting list)

                    const regWithPayment: RegistrationWithPayment = registration.setOptionalRelation(Registration.payment, payment)

                    member.registrations.push(regWithPayment)
                }
            }

            // Check if we have a user
            const user = User.fromRow(row[User.table])
            if (user) {
                // Check if we already have this registration
                if (!member.users.find(r => r.id == user.id)) {
                    member.users.push(user)
                }
            }
        }

        return members

    }

    getStructure() {
        return GroupStruct.create(Object.assign({}, this, { privateSettings: null }))
    }

    getPrivateStructure(permissions: Permissions) {
        const struct = GroupStruct.create(this)
        if (!struct.canViewMembers(permissions)) {
            struct.privateSettings = null
        }
        return struct
    }

    private static async getCount(where: string, params: any[]) {
        const query = `select count(*) as c from \`${Registration.table}\` where ${where}`
        
        const [results] = await Database.select(query, params)
        const count = results[0]['']['c'];
        if (Number.isInteger(count)) {
            return count
        }
        return null
    }

    async updateOccupancy() {
        this.settings.registeredMembers = await Group.getCount(
            "groupId = ? and cycle = ? and waitingList = 0 and registeredAt is not null",
            [this.id, this.cycle]
        )
        //const query = `select count(*) as c from \`${Registration.table}\` where groupId = ? and cycle = ? and (((registeredAt is not null or reservedUntil >= ?) and waitingList = 0) OR (waitingList = 1 AND canRegister = 1))`

        this.settings.reservedMembers = await Group.getCount(
            "groupId = ? and cycle = ? and ((waitingList = 0 and registeredAt is null AND reservedUntil >= ?) OR (waitingList = 1 and canRegister = 1))",
            [this.id, this.cycle, new Date()]
        )

        this.settings.waitingListSize = await Group.getCount(
            "groupId = ? and cycle = ? and waitingList = 1",
            [this.id, this.cycle, new Date()]
        )
    }

    static async deleteUnreachable(organizationId: string, organizationMetaData: OrganizationMetaData, allGroups: Group[]) {
        const reachable = new Map<string, boolean>()

        const visited = new Map<string, boolean>()
        const queue = [organizationMetaData.rootCategoryId]
        visited.set(organizationMetaData.rootCategoryId, true)

        while (queue.length > 0) {
            const id = queue.shift()
            if (!id) {
                break
            }

            const category = organizationMetaData.categories.find(c => c.id === id)
            if (!category) {
                continue
            }

            for (const i of category.categoryIds) {
                if (!visited.get(i)) {
                    queue.push(i)
                    visited.set(i, true)
                }
            }

            for (const g of category.groupIds) {
                reachable.set(g, true)
            }
        }

        for (const group of allGroups) {
            if (!reachable.get(group.id)) {
                console.log("Deleted unreachable group "+group.id+" from organization "+organizationId)
                group.deletedAt = new Date()
                await group.save()
            }
        }
    }

}