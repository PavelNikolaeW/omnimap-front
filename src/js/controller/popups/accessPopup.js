import {Popup} from "./popup";
import {pollTaskStatus} from "../../api/api";
import {customConfirm} from "../../utils/custom-dialog";

/**
 * Функция для вывода сообщений в попапе.
 * @param {HTMLElement} container - контейнер для сообщений
 * @param {string} message - текст сообщения
 * @param {string} type - тип сообщения ('error' или 'success')
 */
function showMessage(container, message, type = "error") {
    container.innerHTML = "";
    const msgEl = document.createElement("div");
    msgEl.className = `popup-message popup-message-${type}`;
    msgEl.textContent = message;
    container.appendChild(msgEl);
}

/**
 * Удаляет сообщение из контейнера.
 * @param {HTMLElement} container
 */
function clearMessage(container) {
    container.innerHTML = "";
}

/**
 * Класс для управления участниками группы.
 * Опции:
 *  - groupId, groupName
 *  - getGroupMembers(groupId): Promise – загрузка участников группы (ожидается массив объектов { username, email, … })
 *  - addUserToGroup(groupId, { username }): Promise
 *  - removeUserGroup(groupId, { username }): Promise
 *  - onCancel – обработчик закрытия попапа (опционально)
 */
class GroupMembersPopup extends Popup {
    constructor(options = {}) {
        options.title =
            options.title || `Управление участниками группы "${options.groupName}"`;
        options.modal = true;
        options.draggable = true;
        options.inputs = [];
        super(options);

        this.groupId = options.groupId;
        this.groupName = options.groupName;
        this.getGroupMembers = options.getGroupMembers;
        this.addUserToGroup = options.addUserToGroup;
        this.removeUserGroup = options.removeUserGroup;

        this.members = [];

        // Контейнер для вывода сообщений
        this.messageContainer = document.createElement("div");
        this.messageContainer.className = "popup-message-container";
        this.contentArea.appendChild(this.messageContainer);

        this.createPopupContent();
        this.loadGroupMembers();
    }

    createPopupContent() {
        // Секция для участников группы
        const membersSection = document.createElement("div");
        membersSection.className = "group-members-section";

        const title = document.createElement("div");
        title.className = 'popup-title'
        title.textContent = "Участники группы";
        membersSection.appendChild(title);

        // Контейнер для списка участников
        this.membersContainer = document.createElement("div");
        this.membersContainer.className = "group-members-list";
        membersSection.appendChild(this.membersContainer);

        // Форма для добавления нового участника
        const addMemberForm = document.createElement("div");
        addMemberForm.className = "group-add-member";

        const usernameInput = document.createElement("input");
        usernameInput.type = "text";
        usernameInput.placeholder = "Имя пользователя";
        usernameInput.id = "group-member-username-input";
        usernameInput.setAttribute("autocomplete", "off");
        addMemberForm.appendChild(usernameInput);

        const addBtn = document.createElement("button");
        addBtn.textContent = "Добавить участника";
        addBtn.className = "access-button"
        addBtn.addEventListener("click", () => {
            clearMessage(this.messageContainer);
            const username = usernameInput.value.trim();
            if (!username) {
                showMessage(this.messageContainer, "Введите имя пользователя");
                return;
            }
            this.addUserToGroup(this.groupId, {username})
                .then(() => {
                    showMessage(this.messageContainer, "Участник успешно добавлен", "success");
                    this.loadGroupMembers();
                    usernameInput.value = "";
                })
                .catch((err) => {
                    console.error(err);
                    showMessage(this.messageContainer, "Ошибка добавления участника");
                });
        });
        addMemberForm.appendChild(addBtn);

        membersSection.appendChild(addMemberForm);

        this.contentArea.appendChild(membersSection);
    }

    loadGroupMembers() {
        if (typeof this.getGroupMembers === "function") {
            this.membersContainer.innerHTML = "Загрузка участников...";
            this.getGroupMembers(this.groupId)
                .then((data) => {
                    this.members = data;
                    this.renderGroupMembers();
                })
                .catch((err) => {
                    console.error(err);
                    this.membersContainer.innerHTML = "Ошибка загрузки участников.";
                });
        } else {
            this.membersContainer.innerHTML =
                "Функция загрузки участников не определена.";
        }
    }

    renderGroupMembers() {
        this.membersContainer.innerHTML = "";
        if (!this.members.length) {
            this.membersContainer.textContent = "Нет участников.";
            return;
        }
        this.members.forEach((member) => {
            const row = document.createElement("div");
            row.className = "group-member-row";

            const info = document.createElement("span");
            info.textContent = `${member.username}${member.email ? " (" + member.email + ")" : ""}`;
            row.appendChild(info);

            const removeBtn = document.createElement("button");
            removeBtn.textContent = "Удалить";
            removeBtn.className = "access-remove-button";
            removeBtn.addEventListener("click", () => {
                clearMessage(this.messageContainer);
                this.removeUserGroup(this.groupId, member.username)
                    .then(() => {
                        showMessage(this.messageContainer, "Участник удалён", "success");
                        this.loadGroupMembers();
                    })
                    .catch((err) => {
                        console.error(err);
                        showMessage(this.messageContainer, "Ошибка удаления участника");
                    });
            });
            row.appendChild(removeBtn);

            this.membersContainer.appendChild(row);
        });
    }

    createButtons() {
        const buttonsContainer = document.createElement("div");
        buttonsContainer.className = this.getPrefixedClass("buttons");

        this.cancelButton = document.createElement("button");
        this.cancelButton.textContent = "Закрыть";
        this.cancelButton.className = this.getPrefixedClass("button-cancel");
        this.cancelButton.addEventListener("click", () => this.handleCancel());
        buttonsContainer.appendChild(this.cancelButton);

        this.popupEl.appendChild(buttonsContainer);
    }

    handleCancel() {
        if (typeof this.options.onCancel === "function") {
            this.options.onCancel();
        }
        this.close();
    }
}

/**
 * Класс для редактирования прав доступа (для пользователей и групп).

 */
export class AccessPopup extends Popup {
    /**
     * Опции:
     *  blockId - ID блока, для которого редактируются права.
     *
     *  getAccessList(blockId): Promise – функция для загрузки списка текущих прав,
     *      возвращает массив объектов вида:
     *      { user_id, username, email, permission }
     *
     *  getGroups(): Promise – функция загрузки списка групп владельца.
     *
     *  updateAccess(blockId, data): Promise – функция обновления прав доступа,
     *      data: { permission_type, target_username } или { permission_type, group_name }
     *
     *  createGroup(groupData): Promise – создание группы (groupData может содержать имя, право и т.п.)
     *  deleteGroup(groupId): Promise – удаление группы
     *
     *  addUserToGroup(groupId, data): Promise – добавление пользователя в группу (data содержит username)
     *  removeUserGroup(groupId, data): Promise – удаление пользователя из группы (data содержит username)
     *
     *  getGroupMembers(groupId): Promise – функция загрузки участников группы (для управления участниками)
     *
     *  onSubmit, onCancel – обработчики закрытия попапа.
     *
     *  permissionChoices – список вариантов прав (массив объектов {value, label}).
     */
    constructor(options = {}) {
        options.title = options.title || `Редактирование прав доступа для`;
        options.modal = true;
        options.draggable = true;
        options.inputs = [];
        super(options);

        this.blockId = options.blockId;

        // Функции для работы с правами (пользователь и группа обновляются через updateAccess)
        this.getAccessList = options.getAccessList;
        this.updateAccess = options.updateAccess;

        // Функции для работы с группами
        this.getGroups = options.getGroups;
        this.createGroup = options.createGroup;
        this.deleteGroup = options.deleteGroup;
        this.addUserToGroup = options.addUserToGroup;
        this.removeUserGroup = options.removeUserGroup;
        this.getGroupMembers = options.getGroupMembers;

        // Варианты прав – можно передать свои через options
        this.permissionChoices = options.permissionChoices || [
            {value: "view", label: "Просмотр"},
            {value: "edit", label: "Редактирование"},
            {value: "edit_ac", label: "Редактирование прав"},
            {value: "delete", label: "Администратор"},
            {value: "deny", label: "Запретить"},
        ];

        // Локальные данные
        this.accessList = []; // список прав для пользователей
        this.groups = []; // список групп

        // Контейнер для вывода сообщений (ошибки, уведомления)
        this.messageContainer = document.createElement("div");
        this.messageContainer.className = "popup-message-container";

        this.createPopupContent();
    }

    createPopupContent() {
        // Очищаем контент базового попапа (кроме messageContainer)
        this.contentArea.innerHTML = "";
        this.blockIdContainer = document.createElement('div')
        this.blockIdContainer.className = 'popup-message-container'
        this.blockIdContainer.innerText = this.options.blockId
        this.contentArea.appendChild(this.blockIdContainer);
        this.contentArea.appendChild(this.messageContainer);

        // --- Секция для пользователей ---
        const userSection = document.createElement("div");
        userSection.className = "access-popup-section access-popup-users";

        const userTitle = document.createElement("h3");
        userTitle.textContent = "Пользователи";
        userSection.appendChild(userTitle);

        // Контейнер для списка пользователей с правами
        this.userListContainer = document.createElement("div");
        this.userListContainer.className = "access-user-list";
        userSection.appendChild(this.userListContainer);

        // Форма добавления нового пользователя
        const addUserForm = document.createElement("div");
        addUserForm.className = "access-add-user";

        const usernameInput = document.createElement("input");
        usernameInput.type = "text";
        usernameInput.placeholder = "Введите имя пользователя";
        usernameInput.id = "access-username-input";
        usernameInput.setAttribute("autocomplete", "off");
        addUserForm.appendChild(usernameInput);
        setTimeout(() => usernameInput.focus(), 0)
        const userPermissionSelect = document.createElement("select");
        userPermissionSelect.id = "access-user-permission-select";
        this.permissionChoices.forEach((choice) => {
            const option = document.createElement("option");
            option.value = choice.value;
            option.textContent = choice.label;
            userPermissionSelect.appendChild(option);
        });
        addUserForm.appendChild(userPermissionSelect);
        addUserForm.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this._addUser(usernameInput, userPermissionSelect)
            }
        })

        const addUserBtn = document.createElement("button");
        addUserBtn.textContent = "Добавить пользователя";
        addUserBtn.className = "access-button";
        addUserBtn.addEventListener("click", () => {
            this._addUser(usernameInput, userPermissionSelect)
        });
        addUserForm.appendChild(addUserBtn);

        userSection.appendChild(addUserForm);
        this.contentArea.appendChild(userSection);

        // --- Секция для групп ---
        const groupSection = document.createElement("div");
        groupSection.className = "access-popup-section access-popup-groups";

        const groupTitle = document.createElement("h3");
        groupTitle.textContent = "Группы";
        groupSection.appendChild(groupTitle);

        // Контейнер для списка групп с правами
        this.groupListContainer = document.createElement("div");
        this.groupListContainer.className = "access-group-list";
        groupSection.appendChild(this.groupListContainer);

        // Форма создания/редактирования группы
        const groupForm = document.createElement("div");
        groupForm.className = "access-group-form";
        groupForm.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const groupName = groupNameInput.value.trim();
                const permission = groupPermissionSelect.value;
                if (!groupName) {
                    showMessage(this.messageContainer, "Введите название группы");
                    return;
                }
                for (let i = 0; i < this.groups.length; i++) {
                    const group = this.groups[i]
                    if (group.name === groupName) {
                        this._updateAccess(permission, groupName, groupNameInput)
                        return;
                    }
                }
                this._createGroup(groupName, permission, groupNameInput)
            }
        })

        const groupNameInput = document.createElement("input");
        groupNameInput.type = "text";
        groupNameInput.placeholder = "Название группы";
        groupNameInput.id = "access-group-name-input";
        groupNameInput.setAttribute("autocomplete", "off");
        groupForm.appendChild(groupNameInput);

        const groupPermissionSelect = document.createElement("select");
        groupPermissionSelect.id = "access-group-permission-select";
        this.permissionChoices.forEach((choice) => {
            const option = document.createElement("option");
            option.value = choice.value;
            option.textContent = choice.label;
            groupPermissionSelect.appendChild(option);
        });
        groupForm.appendChild(groupPermissionSelect);

        // Кнопка для обновления прав уже существующей группы (updateAccess)
        const updateGroupBtn = document.createElement("button");
        updateGroupBtn.textContent = "Применить для группы";
        updateGroupBtn.className = "access-button";
        updateGroupBtn.addEventListener("click", () => {
            clearMessage(this.messageContainer);
            const groupName = groupNameInput.value.trim();
            const permission = groupPermissionSelect.value;
            if (!groupName) {
                showMessage(this.messageContainer, "Введите название группы");
                return;
            }
            this._updateAccess(permission, groupName, groupNameInput)
        });
        groupForm.appendChild(updateGroupBtn);

        // Новая кнопка для создания группы (createGroup)
        const createGroupBtn = document.createElement("button");
        createGroupBtn.textContent = "Создать группу";
        createGroupBtn.className = "access-button";
        createGroupBtn.addEventListener("click", () => {
            clearMessage(this.messageContainer);
            const groupName = groupNameInput.value.trim();
            const permission = groupPermissionSelect.value;
            if (!groupName) {
                showMessage(this.messageContainer, "Введите название группы");
                return;
            }
            this._createGroup(groupName, permission, groupNameInput)
        });
        groupForm.appendChild(createGroupBtn);

        groupSection.appendChild(groupForm);
        this.contentArea.appendChild(groupSection);

        // Загружаем данные при открытии попапа
        this.loadAccessList();
        this.loadGroups();
    }

    _updateAccess(permission, groupName, groupNameInput) {
        this.updateAccess(this.blockId, {
            permission_type: permission,
            group_name: groupName,
        })
            .then(() => {
                showMessage(
                    this.messageContainer,
                    "Права группы обновлены",
                    "success"
                );
                // Обновляем списки групп и прав доступа
                this.loadGroups();
                this.loadAccessList();
                groupNameInput.value = "";
            })
            .catch((err) => {
                console.error(err);
                showMessage(
                    this.messageContainer,
                    "Ошибка обновления прав доступа для группы"
                );
            });
    }

    _createGroup(groupName, permission, groupNameInput) {
        this.createGroup({name: groupName, permission})
            .then(() => {
                showMessage(
                    this.messageContainer,
                    "Группа успешно создана",
                    "success"
                );
                this.loadGroups();
                groupNameInput.value = "";
            })
            .catch((err) => {
                console.error(err);
                showMessage(this.messageContainer, "Ошибка создания группы");
            });
    }

    _addUser(usernameInput, userPermissionSelect) {
        clearMessage(this.messageContainer);
        const username = usernameInput.value.trim();
        const permission = userPermissionSelect.value;
        if (!username) {
            showMessage(this.messageContainer, "Введите имя пользователя");
            return;
        }
        this.updateAccess(this.blockId, {
            permission_type: permission,
            target_username: username,
        })
            .then(() => {
                showMessage(this.messageContainer, "Права пользователя обновлены", "success");
                this.loadAccessList();
                usernameInput.value = "";
            })
            .catch((err) => {
                console.error("Ошибка обновления прав доступа:", err);
                showMessage(this.messageContainer, "Ошибка обновления прав доступа для пользователя");
            });
    }

    // Загрузка списка прав (пользовательские права)
    loadAccessList() {
        if (typeof this.getAccessList === "function") {
            this.userListContainer.innerHTML = "Загрузка прав доступа...";
            this.getAccessList(this.blockId)
                .then((data) => {
                    this.accessList = data;
                    this.renderAccessList();
                })
                .catch((err) => {
                    console.error(err);
                    this.userListContainer.innerHTML = "Ошибка загрузки прав доступа.";
                });
        }
    }

    renderAccessList() {
        this.userListContainer.innerHTML = "";
        if (this.accessList.length === 0) {
            this.userListContainer.textContent = "Нет установленных прав доступа.";
            return;
        }
        this.accessList.forEach((item) => {
            const row = document.createElement("div");
            row.className = "access-user-row";

            const info = document.createElement("span");
            info.textContent = `${item.username} (${item.email})`;
            row.appendChild(info);

            // Селект для изменения права
            const select = document.createElement("select");
            this.permissionChoices.forEach((choice) => {
                const opt = document.createElement("option");
                opt.value = choice.value;
                opt.textContent = choice.label;
                if (choice.value === item.permission) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });
            select.addEventListener("change", () => {
                clearMessage(this.messageContainer);
                this.updateAccess(this.blockId, {
                    permission_type: select.value,
                    target_username: item.username,
                })
                    .then(() => {
                        showMessage(this.messageContainer, "Права пользователя обновлены", "success");
                        item.permission = select.value;
                    })
                    .catch((err) => {
                        console.error(err);
                        showMessage(this.messageContainer, "Ошибка обновления прав доступа для пользователя");
                        select.value = item.permission;
                    });
            });
            row.appendChild(select);
            this.userListContainer.appendChild(row);
        });
    }

    // Загрузка списка групп (для редактирования)
    loadGroups() {
        if (typeof this.getGroups === "function") {
            this.groupListContainer.innerHTML = "Загрузка групп...";
            this.getGroups()
                .then((data) => {
                    this.groups = data;
                    this.renderGroups();
                })
                .catch((err) => {
                    console.error(err);
                    this.groupListContainer.innerHTML = "Ошибка загрузки групп.";
                });
        }
    }

    renderGroups() {
        this.groupListContainer.innerHTML = "";
        if (this.groups.length === 0) {
            this.groupListContainer.textContent = "Нет групп.";
            return;
        }
        this.groups.forEach((group) => {
            const row = document.createElement("div");
            row.className = "access-group-row";

            // Отображаем название группы
            const nameSpan = document.createElement("span");
            nameSpan.textContent = group.name;
            row.appendChild(nameSpan);

            // Кнопка для удаления группы
            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "Удалить группу";
            deleteBtn.className = "access-remove-button";
            deleteBtn.addEventListener("click", () => {
                customConfirm(`Вы хотите удалить группу ${group.name}?`).then(ok => {
                    if (ok) {
                        clearMessage(this.messageContainer);
                        if (typeof this.deleteGroup === "function") {
                            this.deleteGroup(group.id)
                                .then(() => {
                                    showMessage(this.messageContainer, "Группа удалена", "success");
                                    // Обновляем список групп и пользователей
                                    this.loadGroups();
                                    this.loadAccessList();
                                })
                                .catch((err) => {
                                    console.error(err);
                                    showMessage(this.messageContainer, "Ошибка удаления группы");
                                });
                        }
                    }
                })
            });

            // Кнопка для управления участниками группы
            const manageBtn = document.createElement("button");
            manageBtn.textContent = "Управлять участниками";
            manageBtn.className = "access-button";
            manageBtn.addEventListener("click", () => {
                clearMessage(this.messageContainer);
                if (typeof this.getGroupMembers !== "function") {
                    showMessage(this.messageContainer, "Функция загрузки участников группы не определена");
                    return;
                }
                this.popupEl.style.display = "none";
                this.groupPopup = new GroupMembersPopup({
                    groupId: group.id,
                    groupName: group.name,
                    getGroupMembers: this.getGroupMembers,
                    addUserToGroup: this.addUserToGroup,
                    removeUserGroup: this.removeUserGroup,
                    onCancel: () => {
                        this.popupEl.style.display = "block";
                    },
                    onSubmit: () => {
                        this.popupEl.style.display = "block";
                    }
                });
            });
            const div = document.createElement('div')
            div.appendChild(deleteBtn)
            div.appendChild(manageBtn)
            row.appendChild(div);

            this.groupListContainer.appendChild(row);
        });
    }

    createButtons() {
        const buttonsContainer = document.createElement("div");
        buttonsContainer.className = this.getPrefixedClass("buttons");

        this.cancelButton = document.createElement("button");
        this.cancelButton.textContent = "Закрыть";
        this.cancelButton.className = this.getPrefixedClass("button-cancel");
        this.cancelButton.addEventListener("click", () => this.handleCancel());
        buttonsContainer.appendChild(this.cancelButton);

        this.popupEl.appendChild(buttonsContainer);
    }

    handleSubmit() {
        if (typeof this.options.onSubmit === "function") {
            this.options.onSubmit();
        }
        if (this.groupPopup) {
            this.groupPopup.handleCancel()
            this.groupPopup = undefined
        }

        this.close();
    }

    handleCancel() {
        if (typeof this.options.onCancel === "function") {
            this.options.onCancel();
        }
        if (this.groupPopup) {
            this.groupPopup.handleCancel()
            this.groupPopup = undefined
        }

        this.close();
    }

    async handleTask(taskId) {
        try {
            // Если успех — просто идём дальше
            await pollTaskStatus(taskId);
            alert('Операция успешно завершена!');
        } catch (error) {
            // Если что-то пошло не так — выдаём ошибку
            console.error('Ошибка при опросе статуса задачи:', error);
            alert('Ошибка при выполнении операции: ' + error.message);
        }
    }
}
