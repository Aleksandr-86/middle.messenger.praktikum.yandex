import { chatAPI } from 'api/ChatAPI';
import { router } from 'core/Router';
import { store } from 'core/Store';
import { fromSnakeToCamelCase, getChatCardDate } from 'services/helpers';
import { messagesController } from './MessageController';

class ChatController {
  private _api: typeof chatAPI = chatAPI;

  /**
   * Возвращает чаты текущего пользователя.
   * offset: сдвиг.
   * limit: количество возвращаемых элементов массива.
   * title: поиск по названию чата.
   */
  async getChats(offset = 0, limit = 10, title = '') {
    this._api
      .getChats(offset, limit, title)
      .then(xhr => {
        const code = xhr.status;

        if (code === 200) {
          /**
           * Модификация и сохранение в хранилище массива с объектами-чатами,
           * полученными с сервера
           */
          const chats: Chat[] = [];
          const respObjArr = JSON.parse(xhr.response);

          respObjArr.forEach((chat: Chat) => {
            chat = fromSnakeToCamelCase(chat);

            if (chat.lastMessage) {
              chat.lastMessage.time = getChatCardDate(chat.lastMessage.time);
            }

            chats.push(chat);
          });

          store.set('chats', chats);
        } else if (code === 401) {
          store.set('isAuth', false);
          router.go('/');
        } else if (code === 500) {
          console.error('Непредвиденная ошибка');
        }
      })
      .catch(error => console.error(error));
  }

  // Создаёт чат
  async createChat() {
    const input = document.body.querySelector(
      '.chats-board__modal-input'
    ) as HTMLInputElement;

    let chatName = '';
    if (!input.value) {
      chatName =
        'Новый чат, ' +
        new Date().toLocaleString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
    } else {
      chatName = input.value;
    }

    let chatId: number | null = null;

    await this._api
      .createChat(chatName)
      .then(xhr => {
        const code = xhr.status;

        if (code === 200) {
          chatId = JSON.parse(xhr.response).id;
          store.set('chatId', chatId);
        } else if (code === 401) {
          store.set('isAuth', false);
          router.go('/');
        } else if (code === 500) {
          console.error('Непредвиденная ошибка');
        }
      })
      .catch(error => console.error(error));

    store.set('modal.first', false);
    this.getChats();

    if (!chatId) {
      return;
    }

    messagesController.connect();
    chatController.getChatUsers(chatId);
  }

  // Удаляет чат по идентификатору
  async deleteChat() {
    const chatId = store.get().chatId;

    if (!chatId) {
      return;
    }

    await this._api
      .deleteChat(chatId)
      .then(xhr => {
        const code = xhr.status;

        if (code === 200) {
          store.set('modal.second', false);
        } else if (code === 401) {
          store.set('isAuth', false);
          router.go('/');
        } else if (code === 500) {
          console.error('Непредвиденная ошибка');
        }
      })
      .catch(error => console.error(error));

    store.set('chatUsers', []);
    this.getChats();
  }

  /**
   * Возвращает массив объектов с подробной информацией
   * о всех пользователях текущего чата.
   * chatId: идентификатор чата.
   * offset: сдвиг.
   * limit: количество возвращаемых элементов массива.
   * name: имя пользователя для фильтрации
   * в формате '{first_name} {second_name}'.
   * email: почта пользователя для фильтрации.
   */
  async getChatUsers(
    chatId: number,
    offset = 0,
    limit = 10,
    name = '',
    email = ''
  ) {
    await this._api
      .getChatUsers(chatId, offset, limit, name, email)
      .then(xhr => {
        const code = xhr.status;

        if (code === 200) {
          store.set('chatUsers', JSON.parse(xhr.response));
        } else if (code === 401) {
          store.set('isAuth', false);
          router.go('/');
        } else if (code === 404) {
          console.error('Чат не найден');
        } else if (code === 500) {
          console.error('Непредвиденная ошибка');
        }
      })
      .catch(error => console.error(error));
  }

  // Добавляет пользователей к чату
  async addUsersToChat(usersIds: number[]) {
    const chatId = store.get().chatId;

    if (!chatId) {
      store.set('modal.third', false);
      return;
    }

    await this._api
      .addUsersToChat(usersIds, chatId)
      .then(xhr => {
        const code = xhr.status;

        if (code === 200) {
          store.set('modal.third', false);
        } else if (code === 401) {
          store.set('isAuth', false);
          router.go('/');
        } else if (code === 500) {
          console.error('Непредвиденная ошибка');
        }
      })
      .catch(error => console.error(error));

    this.getChatUsers(chatId);
    this.getChats();
  }

  // Удаляет пользователей из чата
  async deleteUsersFromChat(login: string) {
    const chatId = store.get().chatId;

    if (!chatId) {
      store.set('modal.third', false);
      return;
    }

    try {
      await this.getChatUsers(chatId);
    } catch (error: unknown) {
      console.error(error);
    }

    const chatUsers = store.get().chatUsers;

    let userForDeleteId: number | null = null;

    for (const user of chatUsers) {
      if (login === user.login) {
        userForDeleteId = user.id;
        break;
      }
    }

    if (userForDeleteId === null) {
      return;
    }

    await this._api
      .deleteUsersFromChat([userForDeleteId], chatId)
      .then(xhr => {
        const code = xhr.status;

        if (code === 200) {
          store.set('modal.fourth', false);
        } else if (code === 401) {
          store.set('isAuth', false);
          router.go('/');
        } else if (code === 500) {
          console.error('Непредвиденная ошибка');
        }
      })
      .catch(error => console.error(error));

    this.getChatUsers(chatId);
    this.getChats();
  }

  // Возвращает токен необходимый для подключения к серверу сообщений
  async getToken(chatId: number) {
    return this._api.getToken(chatId).then(xhr => {
      return JSON.parse(xhr.response).token;
    });
  }
}

export const chatController = new ChatController();
