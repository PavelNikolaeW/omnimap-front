import localforage from "localforage";
import {dispatch} from "../utils/utils";

class Auth {

    /**
     * Если текущий юзер не anonim проверят токены.
     * Если токены невалидны? то устанавливает значение currentUser = anonim.
     */
    async checkAuth() {
        let user = await localforage.getItem('currentUser')
        if (user == null) {
            dispatch('InitAnonimUser')
            return false
        }
        if (user !== 'anonim') {
            //     check token
        }
        return true
    }

}

export const auth = new Auth()