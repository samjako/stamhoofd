<template>
    <div class="st-view admins-list-view">
        <STNavigationBar title="Beheerders">
            <button slot="right" class="button text only-icon-smartphone" aria-label="Nieuwe beheerder" type="button" @click="createAdmin">
                <span class="icon add" />
                <span>Beheerder</span>
            </button>

            <BackButton v-if="canPop" slot="left" @click="pop" />
            <button v-else slot="right" class="button icon close gray" type="button" @click="pop" />
        </STNavigationBar>

    
        <main>
            <h1>Beheerders</h1>
            <p>Voeg hier beheerders toe en deel ze op in groepen. Een beheerder kan in meerdere groepen zitten. Je kan vervolgens de toegang tot zaken regelen per groep.</p>

            <Spinner v-if="loading" />

            <template v-else>
                <hr>
                <h2>
                    Hoofdbeheerders
                </h2>
                <p>Hoofdbeheerders hebben toegang tot alles, zonder beperkingen.</p>

                <Spinner v-if="loading" />
                <STList v-else>
                    <STListItem v-for="admin in getAdmins()" :key="admin.id" :selectable="true" class="right-stack" @click="editAdmin(admin)">
                        <h2 class="style-title-list">
                            {{ admin.firstName }} {{ admin.lastName }}
                        </h2>
                        <p class="style-description-small">
                            {{ admin.email }}
                        </p>
                        <p class="style-description-small">
                            {{ permissionList(admin) }}
                        </p>

                        <template slot="right">
                            <span v-if="admin.id === me.id" class="style-tag">
                                Ik
                            </span>
                            <span><span class="icon gray edit" /></span>
                        </template>
                    </STListItem>

                    <STListItem v-for="invite in getInviteAdmins()" :key="invite.id" :selectable="true" class="right-stack" @click="editInvite(invite)">
                        <h2 class="style-title-list">
                            {{ invite.userDetails.firstName || "?" }} {{ invite.userDetails.lastName || "" }}
                        </h2>
                        <p class="style-description-small">
                            {{ invite.userDetails.email }}
                        </p>
                        <p class="style-description-small">
                            {{ permissionList(invite) }}
                        </p>

                        <span v-if="isExpired(invite)" class="style-tag warn only-smartphone">
                            Vervallen
                        </span>
                        <span v-else class="style-tag warn only-smartphone">
                            Niet geaccepteerd
                        </span>

                        <template slot="right">
                            <span v-if="isExpired(invite)" class="style-tag warn hide-smartphone">
                                Vervallen
                            </span>
                            <span v-else class="style-tag warn hide-smartphone">
                                Niet geaccepteerd
                            </span>
                            <span><span class="icon gray edit" /></span>
                        </template>
                    </STListItem>
                </STList>

                <div v-for="(role, index) in roles" :key="role.id" class="container">
                    <hr>
                    <h2 class="style-with-button">
                        <div>
                            {{ role.name }}
                        </div>
                        <div>
                            <button class="button icon gray arrow-up" type="button" @click="moveRoleUp(index, role)" />
                            <button class="button icon gray arrow-down" type="button" @click="moveRoleDown(index, role)" />
                            <button class="button text" type="button" @click="editRole(role)">
                                <span class="icon settings" />
                                <span class="hide-smartphone">Bewerken</span>
                            </button>
                        </div>
                    </h2>

                    <Spinner v-if="loading" />
                    <STList v-else>
                        <STListItem v-for="admin in getAdminsForRole(role)" :key="admin.id" :selectable="true" class="right-stack" @click="editAdmin(admin)">
                            <h2 class="style-title-list">
                                {{ admin.firstName }} {{ admin.lastName }}
                            </h2>
                            <p class="style-description-small">
                                {{ admin.email }}
                            </p>
                            <p class="style-description-small">
                                {{ permissionList(admin) }}
                            </p>

                            <template slot="right">
                                <span v-if="admin.id === me.id" class="style-tag">
                                    Ik
                                </span>
                                <span><span class="icon gray edit" /></span>
                            </template>
                        </STListItem>

                        <STListItem v-for="invite in getInvitesForRole(role)" :key="invite.id" :selectable="true" class="right-stack" @click="editInvite(invite)">
                            <h2 class="style-title-list">
                                {{ invite.userDetails.firstName || "?" }} {{ invite.userDetails.lastName || "" }}
                            </h2>
                            <p class="style-description-small">
                                {{ invite.userDetails.email }}
                            </p>
                            <p class="style-description-small">
                                {{ permissionList(invite) }}
                            </p>

                            <span v-if="isExpired(invite)" class="style-tag warn only-smartphone">
                                Vervallen
                            </span>
                            <span v-else class="style-tag warn only-smartphone">
                                Niet geaccepteerd
                            </span>

                            <template slot="right">
                                <span v-if="isExpired(invite)" class="style-tag warn hide-smartphone">
                                    Vervallen
                                </span>
                                <span v-else class="style-tag warn hide-smartphone">
                                    Niet geaccepteerd
                                </span>
                                <span><span class="icon gray edit" /></span>
                            </template>
                        </STListItem>
                    </STList>

                    <p v-if="getAdminsForRole(role).length + getInvitesForRole(role).length == 0" class="info-box">
                        Geen beheerders in deze groep
                    </p>
                </div>

                <div v-if="getAdminsWithoutRole().length > 0 || getInvitesWithoutRole().length > 0" class="container">
                    <hr>
                    <h2>
                        Beheerders die niet in een groep zitten
                    </h2>
                    <p>Deze beheerders hebben nergens toegang toe, deel ze op in groepen op basis van hun functie in de vereniging.</p>

                    <STList v-if="!loading">
                        <STListItem v-for="admin in getAdminsWithoutRole()" :key="admin.id" :selectable="true" class="right-stack" @click="editAdmin(admin)">
                            <h2 class="style-title-list">
                                {{ admin.firstName }} {{ admin.lastName }}
                            </h2>
                            <p class="style-description-small">
                                {{ admin.email }}
                            </p>
                            <p class="style-description-small">
                                {{ permissionList(admin) }}
                            </p>

                            <template slot="right">
                                <span><span class="icon gray edit" /></span>
                            </template>
                        </STListItem>

                        <STListItem v-for="invite in getInvitesWithoutRole()" :key="invite.id" :selectable="true" class="right-stack" @click="editInvite(invite)">
                            <h2 class="style-title-list">
                                {{ invite.userDetails.firstName || "?" }} {{ invite.userDetails.lastName || "" }}
                            </h2>
                            <p class="style-description-small">
                                {{ invite.userDetails.email }}
                            </p>
                            <p class="style-description-small">
                                {{ permissionList(invite) }}
                            </p>

                            <template slot="right">
                                <p v-if="isExpired(invite)">
                                    Uitnodiging vervallen
                                </p>
                                <p v-else>
                                    Uitnodiging nog niet geaccepteerd
                                </p>
                                <span><span class="icon gray edit" /></span>
                            </template>
                        </STListItem>
                    </STList>
                </div>

                <hr>

                <p>
                    <button class="button text" @click="addRole">
                        <span class="icon add" />
                        <span>Nieuwe beheerdersgroep toevoegen</span>
                    </button>
                </p>
                <p>
                    <button class="button text" @click="createAdmin">
                        <span class="icon add" />
                        <span>Nieuwe beheerder toevoegen</span>
                    </button>
                </p>
            </template>
        </main>
    </div>
</template>


<script lang="ts">
import { AutoEncoderPatchType } from '@simonbackx/simple-encoding';
import { Request } from '@simonbackx/simple-networking';
import { ComponentWithProperties, NavigationController, NavigationMixin } from "@simonbackx/vue-app-navigation";
import { BackButton, Checkbox, Spinner, STList, STListItem, STNavigationBar, STToolbar, Toast } from "@stamhoofd/components";
import { SessionManager, UrlHelper } from '@stamhoofd/networking';
import { Invite, Organization, OrganizationPrivateMetaData, PermissionRole, PermissionRoleDetailed, User } from '@stamhoofd/structures';
import { Sorter } from "@stamhoofd/utility";
import { Component, Mixins } from "vue-property-decorator";

import { OrganizationManager } from '../../../classes/OrganizationManager';
import AdminInviteView from './AdminInviteView.vue';
import EditRoleView from "./EditRoleView.vue";

@Component({
    components: {
        Checkbox,
        STNavigationBar,
        STToolbar,
        STList,
        STListItem,
        Spinner,
        BackButton
    }
})
export default class AdminsView extends Mixins(NavigationMixin) {
    SessionManager = SessionManager // needed to make session reactive
    loading = true

    mounted() {
        this.load(true).catch(e => {
            console.error(e)
        })

        UrlHelper.setUrl("/settings/admins")
        document.title = "Stamhoofd - Beheerders"
    }

    async load(force = false) {
        await OrganizationManager.loadAdmins(force, true, this)
        this.loading = false
    }

    beforeDestroy() {
        // Clear all pending requests
        Request.cancelAll(this)
    }

    get admins() {
        return this.organization.admins ?? []
    }

    get invites() {
        return this.organization.invites ?? []
    }

    get organization() {
        return OrganizationManager.organization
    }

    get enableMemberModule() {
        return this.organization.meta.modules.useMembers
    }

    get me() {
        return this.SessionManager.currentSession!.user
    }

    permissionList(user: User | Invite) {
        const list: string[] = []
        if (user.permissions?.hasFullAccess()) {
            list.push("Hoofdbeheerders")
        }

        for (const role of user.permissions?.roles ?? []) {
            list.push(role.name)
        }
        return list.join(", ")
    }

    get roles() {
        return this.organization.privateMeta?.roles ?? []
    }

    get sortedAdmins() {
        return this.admins.slice().sort((a, b) => Sorter.byStringValue(a.firstName+" "+a.lastName, b.firstName+" "+b.lastName))
    }

    createAdmin() {
        this.present(new ComponentWithProperties(NavigationController, { 
            root: new ComponentWithProperties(AdminInviteView, {
                onUpdateInvite: (patched: Invite | null) => {
                    if (patched) {
                        this.invites.push(patched)
                    }
                }
            }) 
        }).setDisplayStyle("popup"))
    }

    isExpired(invite: Invite) {
        return invite.validUntil.getTime() < new Date().getTime()+10*1000
    }

    moveRoleUp(index: number, role: PermissionRoleDetailed) {
        if (index == 0) {
            return
        }
        const prev = this.roles[index - 2]?.id
        const privateMeta = OrganizationPrivateMetaData.patch({})
        privateMeta.roles.addMove(role.id, prev ?? null)
        const patch = Organization.patch({
            id: this.organization.id,
            privateMeta
        })
        OrganizationManager.patch(patch).catch(e => Toast.fromError(e).show())
    }

    moveRoleDown(index: number, role: PermissionRoleDetailed) {
        if (index >= this.roles.length - 1) {
            return
        }
        const prev = this.roles[index + 1]?.id
        const privateMeta = OrganizationPrivateMetaData.patch({})
        privateMeta.roles.addMove(role.id, prev ?? null)
        const patch = Organization.patch({
            id: this.organization.id,
            privateMeta
        })
        OrganizationManager.patch(patch).catch(e => Toast.fromError(e).show())
    }

    editAdmin(admin: User) {
        this.present(new ComponentWithProperties(NavigationController, { 
            root: new ComponentWithProperties(AdminInviteView, { 
                editUser: admin,
                onUpdateUser: (patched: User | null) => {
                    const i = this.admins.findIndex(a => a.id === admin.id)

                    if (i != -1) {
                        this.admins.splice(i, 1, ...patched ? [patched] : [])
                    }
                    
                }
            }) ,
            
        }).setDisplayStyle("popup"))
    }

    getAdminsForRole(role: PermissionRole) {
        return this.sortedAdmins.filter(a => !!a.permissions?.roles.find(r => r.id === role.id))
    }

    getInvitesForRole(role: PermissionRole) {
        return this.invites.filter(a => !!a.permissions?.roles.find(r => r.id === role.id))
    }

    getAdminsWithoutRole() {
        // We still do a check on ID because users might have a role that is deleted
        const ids = this.roles.map(r => r.id)
        return this.sortedAdmins.filter(a => !a.permissions?.hasFullAccess() && !a.permissions?.roles.find(r => ids.includes(r.id)))
    }

    getInvitesWithoutRole() {
        // We still do a check on ID because users might have a role that is deleted
        const ids = this.roles.map(r => r.id)
        return this.invites.filter(a => !a.permissions?.hasFullAccess() && !a.permissions?.roles.find(r => ids.includes(r.id)))
    }

    getAdmins() {
        // We still do a check on ID because users might have a role that is deleted
        return this.sortedAdmins.filter(a => !!a.permissions?.hasFullAccess())
    }

    getInviteAdmins() {
        // We still do a check on ID because users might have a role that is deleted
        return this.invites.filter(a => !!a.permissions?.hasFullAccess())
    }

    addRole() {
        const role = PermissionRoleDetailed.create({})
        const privateMeta = OrganizationPrivateMetaData.patch({})
        privateMeta.roles.addPut(role)

        const patch = Organization.patch({ 
            id: this.organization.id,
            privateMeta
        })
        
        this.present(new ComponentWithProperties(NavigationController, { 
            root: new ComponentWithProperties(EditRoleView, { 
                role,
                organization: this.organization.patch(patch),
                saveHandler: async (p: AutoEncoderPatchType<Organization>) => {
                    const doSave = patch.patch(p)
                    await OrganizationManager.patch(doSave)
                    if (doSave.admins || doSave.invites) {
                        await this.load(true)
                    }
                }
            }),
        }).setDisplayStyle("popup"))
    }

    editRole(role: PermissionRoleDetailed) {
        const patch = Organization.patch({ 
            id: this.organization.id
        })
        
        this.present(new ComponentWithProperties(NavigationController, { 
            root: new ComponentWithProperties(EditRoleView, { 
                role,
                organization: this.organization,
                saveHandler: async (p: AutoEncoderPatchType<Organization>) => {
                    const doSave = patch.patch(p)
                    await OrganizationManager.patch(doSave)
                    if (doSave.admins || doSave.invites) {
                        await this.load(true)
                    }
                }
            }),
        }).setDisplayStyle("popup"))
    }

    editInvite(invite: Invite) {
        this.present(new ComponentWithProperties(NavigationController, { 
            root: new ComponentWithProperties(AdminInviteView, { 
                editInvite: invite,
                onUpdateInvite: (patched: Invite | null) => {
                    const i = this.invites.findIndex(a => a.id === invite.id)

                    if (i != -1) {
                        this.invites.splice(i, 1, ...patched ? [patched] : [])
                    } else {
                        // Create the invite (it has been regenerated)
                        if (patched) {
                            this.invites.push(patched)
                        }
                    }
                }
            }),
        }).setDisplayStyle("popup"))
    }
}

</script>

<style lang="scss">
@use "@stamhoofd/scss/base/variables.scss" as *;

.admins-list-view {
    background: $color-background;
}
</style>
