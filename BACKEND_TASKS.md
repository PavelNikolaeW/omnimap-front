# Задачи для Backend

## Проблема: Link блок не обновляется при удалении source блока

### Описание
Когда пользователь удаляет расшаренный блок (source), link блоки которые на него ссылаются не получают обновление. В результате:
1. Source блок удаляется (приходит `deleted: true`)
2. Link блок остаётся с `view: 'link'` и `data.source` указывающим на удалённый блок
3. Фронт пытается отрендерить несуществующий source → ошибка рендеринга

### Ожидаемое поведение
При удалении source блока, бэкенд должен отправить WebSocket обновление для всех link блоков которые ссылаются на него:

```json
{
  "type": "block_update",
  "data": {
    "id": "link-block-uuid",
    "title": "Ссылка удалена",
    "data": {
      "view": null,
      "source": null,
      "source_deleted": true,
      "source_deleted_title": "Название удалённого блока",
      "text": "Блок, на который ссылался этот блок, был удалён"
    }
  }
}
```

### Логи с фронта
```
📥 webSocUpdateBlock received: [
  {id: '9e9e9970-...', deleted: true},  // source блок
  {id: 'a2e98710-...', deleted: true},
  ...
]

🔗 createLink: {
  blockId: '64046849-...',           // link блок
  sourceId: '9e9e9970-...',          // указывает на удалённый source!
  pending: undefined,
  rejected: undefined
}

POST /api/v1/load-empty/ 404  // пытается загрузить удалённый блок
```

### Что нужно сделать
1. При удалении блока проверить, есть ли link блоки которые ссылаются на него (`data.source == deleted_block_id`)
2. Отправить WebSocket обновление для каждого такого link блока с изменённым view и сообщением об удалении
