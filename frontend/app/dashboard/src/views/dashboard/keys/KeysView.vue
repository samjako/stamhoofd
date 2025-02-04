<template>
    <div id="keys-view" class="st-view background">
        <STNavigationBar title="Instellingen">
            <BackButton v-if="canPop" slot="left" @click="pop" />
        </STNavigationBar>

        <main>
            <h1>
                Gebruikers goedkeuren
            </h1>

            <p class="info-box">
                De end-to-end versleuteling wordt uitgefaseerd. In de toekomst zal je dit nooit meer moeten doen.
            </p>

            <p>Vroeger gebruikte Stamhoofd end-to-end versleuteling voor de beveiliging van leden. Als een gebruiker zijn wachtwoord vergat, of een nieuw account aanmaakte binnen hetzelfde gezin, dan had die gebruiker geen toegang meer tot de encryptiesleutels. De gebruiker krijgt dan een melding dat hun account nog moet worden goedgekeurd. Ze kunnen wel al inschrijven, maar ze kunnen gewoon de bestaande gegevens niet bekijken (behalve voornaam) tenzij ze alles opnieuw ingeven. Hier kan je nakijken voor wie dit het geval is en kan je nieuwe sleutels delen met deze gebruikers.</p>
        
            <STErrorsDefault :error-box="errorBox" />

            <STList>
                <STListItem v-for="user in users" :key="user.user.id" :selectable="true" element-name="label">
                    <Checkbox slot="left" v-model="user.selected" />

                    <h2 class="style-title-list">
                        {{ user.user.email }} ({{ user.name }})
                    </h2>
                    <p class="style-description">
                        Leden: {{ user.members.map(m => m.name).join(', ') }}
                    </p>
                </STListItem>
            </STList>
        </main>

        <STToolbar>
            <template #left>
                {{ selectionCount ? selectionCount : "Geen" }} {{ selectionCount == 1 ? "gebruiker" : "gebruikers" }} geselecteerd
            </template>
            <template #right>
                <LoadingButton :loading="loadingAccepting">
                    <button class="button primary" :disabled="selectionCount == 0" @click="acceptSelected()">
                        Toegang geven
                    </button>
                </LoadingButton>
            </template>
        </STToolbar>
    </div>
</template>

<script lang="ts">
import { ArrayDecoder, Decoder } from "@simonbackx/simple-encoding";
import { NavigationMixin } from "@simonbackx/vue-app-navigation";
import { BackButton, CenteredMessage, Checkbox,ErrorBox, LoadingButton, STErrorsDefault,STList, STListItem,STNavigationBar, STToolbar, Toast } from "@stamhoofd/components";
import { LoginHelper, SessionManager } from "@stamhoofd/networking";
import { EncryptedMemberWithRegistrations, MemberWithRegistrations, User } from "@stamhoofd/structures";
import { Component, Mixins } from "vue-property-decorator";

import { MemberManager } from "../../../classes/MemberManager";
import { OrganizationManager } from "../../../classes/OrganizationManager";

class UserWithMembers {
    user: User
    members: MemberWithRegistrations[]
    selected = false

    constructor(user: User, members: MemberWithRegistrations[]) {
        this.user = user
        this.members = members
    }

    get name() {
        for (const member of this.members) {
            for (const parent of member.details.parents) {
                if (parent.email === this.user.email && parent.name) {
                    return parent.name
                }
            }

            if (member.details.email && member.details.email === this.user.email && member.name) {
                return member.name
            }
        }
        
        return "Geen naam gevonden"
    }
}

@Component({
    components: {
        STNavigationBar,
        STToolbar,
        BackButton,
        LoadingButton,
        STErrorsDefault,
        STList,
        STListItem,
        Checkbox
    }
})
export default class KeysView extends Mixins(NavigationMixin) {
    errorBox: ErrorBox | null = null

    loading = false
    members: MemberWithRegistrations[] = []
    users: UserWithMembers[] = []

    loadingAccepting = false

    mounted() {
        this.reload().catch(e => {
            console.error(e)
        })
    }

    async reload() {
        try {
            this.loading = true
            const response = await SessionManager.currentSession!.authenticatedServer.request({
                method: "GET",
                path: "/organization/key-requests",
                decoder: new ArrayDecoder(EncryptedMemberWithRegistrations as Decoder<EncryptedMemberWithRegistrations>)
            })
            this.members = await MemberManager.decryptMembersWithRegistrations(response.data)
            this.calculateUsers()
        } catch (e) {
            this.errorBox = new ErrorBox(e)
        }
        this.loading = false
    }

    get selectionCount() {
        return this.users.reduce((c, u) => c + (u.selected ? 1 : 0), 0)
    }

    calculateUsers() {
        const users = new Map<string, UserWithMembers>()
        for (const member of this.members) {
            for (const u of member.users) {
                if (u.requestKeys) {
                    const existing = users.get(u.id)
                    if (existing) {
                        existing.members.push(member)
                    } else {
                        users.set(u.id, new UserWithMembers(u, [member]))
                    }
                }
            }
        }
        this.users = [...users.values()]
    }

    async acceptSelected() {
        if (this.loadingAccepting) {
            return
        }
        this.loadingAccepting = true
        try {
            for (const user of this.users) {
                if (user.selected) {
                    await this.acceptUser(user)
                }
            }
            new Toast("Alle gebruikers die verbonden zijn met deze leden hebben nu opnieuw toegang tot alle gegevens", "success green").show()
        } catch (e) {
            CenteredMessage.fromError(e).show()
        }
        this.loadingAccepting = false
        await this.reload()
    }

    async acceptUser(user: UserWithMembers) {
        await MemberManager.patchMembersDetails(user.members)

        // Update user
        await LoginHelper.patchUser(SessionManager.currentSession!, User.patch({
            id: user.user.id,
            requestKeys: false
        }))
        OrganizationManager.organization.privateMeta!.requestKeysCount--
    }
}
</script>