import localforage from "localforage";

export class BaseController {
    constructor() {
        this.user = null;
        this.addListeners()
    }


    addListeners() {
        window.addEventListener("Logout", this.setCurrentUser.bind(this));
        window.addEventListener("Login", this.setCurrentUser.bind(this));
    }

    setCurrentUser(callback) {
        localforage.getItem("currentUser", (err, user) => {
            if (err) {
                console.error("Ошибка при получении пользователя:", err);
                return;
            }
            this.user = user;
            if (callback && typeof callback === 'function') callback()
        });
    }
}