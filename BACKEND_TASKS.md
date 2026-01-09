# Задачи для backend: E2E тестовые данные

## Дополнить `create_initial_data.py`

```python
class Command(BaseCommand):
    help = 'Создание суперпользователя и начальных данных'

    def handle(self, *args, **kwargs):
        # Создание суперпользователя
        if not User.objects.filter(username='admin').exists():
            admin = User.objects.create_superuser('admin', 'admin@example.com',
                                                  os.environ.get('DJANGO_ADMIN_PASS', 'admin'))
            admin_block = Block.objects.create(title='admin', creator=admin)
            # 'delete' permission includes edit rights (hierarchical permissions)
            BlockPermission.objects.get_or_create(
                block=admin_block, user=admin, defaults={'permission': 'delete'}
            )
            self.stdout.write(self.style.SUCCESS('Суперпользователь admin создан.'))

        if not User.objects.filter(username='main_page').exists():
            main_page_user = User.objects.create_superuser('main_page', 'main_page@example.com',
                                                           os.environ.get('DJANGO_ADMIN_PASS', 'admin'))
            self.stdout.write(self.style.SUCCESS('Суперпользователь main_page создан.'))

            main_block = Block.objects.create(title='omniMap', creator=main_page_user)
            auth_block = Block.objects.create(title='authBlock', creator=main_page_user)
            login_block = Block.objects.create(title='login', data={'view': 'auth'}, creator=main_page_user)
            reg_block = Block.objects.create(title='registration', data={'view': 'registration'}, creator=main_page_user)
            # 'delete' permission includes edit rights (hierarchical permissions)
            for block in [main_block, auth_block, login_block, reg_block]:
                BlockPermission.objects.get_or_create(
                    block=block, user=main_page_user, defaults={'permission': 'delete'}
                )

            main_block.add_child(auth_block)
            auth_block.add_children([login_block, reg_block])

        # ============== E2E ТЕСТОВЫЕ ПОЛЬЗОВАТЕЛИ ==============
        if os.environ.get('E2E_MODE'):
            self._create_e2e_test_data()

    def _create_e2e_test_data(self):
        """
        Создание тестовых данных для E2E тестов.

        Структура:
        - e2e_admin (owner) - имеет корневой блок с дочерними блоками
        - e2e_editor - имеет свой корневой блок + ссылку на shared блок admin'а
        - e2e_viewer - имеет свой корневой блок + ссылку на shared блок (только просмотр)
        """

        e2e_admin_password = os.environ.get('E2E_ADMIN_PASSWORD', 'e2e_admin_password')
        e2e_editor_password = os.environ.get('E2E_EDITOR_PASSWORD', 'e2e_editor_password')
        e2e_viewer_password = os.environ.get('E2E_VIEWER_PASSWORD', 'e2e_viewer_password')

        # ===== 1. Создаём e2e_admin =====
        e2e_admin, admin_created = User.objects.get_or_create(
            username='e2e_admin',
            defaults={'email': 'e2e_admin@test.local'}
        )
        if admin_created:
            e2e_admin.set_password(e2e_admin_password)
            e2e_admin.save()
            self.stdout.write(self.style.SUCCESS('E2E пользователь e2e_admin создан.'))

        # Корневой блок admin'а
        admin_root, _ = Block.objects.get_or_create(
            title='E2E Admin Root',
            creator=e2e_admin,
            defaults={'content': 'Root block for e2e_admin'}
        )
        BlockPermission.objects.get_or_create(
            block=admin_root, user=e2e_admin, defaults={'permission': 'delete'}
        )

        # Дочерние блоки для тестов CRUD и arrows
        block1, _ = Block.objects.get_or_create(
            title='Block for CRUD',
            creator=e2e_admin,
            defaults={'content': 'This block is used for create/edit/delete tests'}
        )
        BlockPermission.objects.get_or_create(
            block=block1, user=e2e_admin, defaults={'permission': 'delete'}
        )

        block2, _ = Block.objects.get_or_create(
            title='Block for Arrows',
            creator=e2e_admin,
            defaults={'content': 'This block is used for connection/arrow tests'}
        )
        BlockPermission.objects.get_or_create(
            block=block2, user=e2e_admin, defaults={'permission': 'delete'}
        )

        # Shared блок - будет доступен editor и viewer
        shared_block, _ = Block.objects.get_or_create(
            title='Shared Block',
            creator=e2e_admin,
            defaults={'content': 'This block is shared with editor and viewer'}
        )
        BlockPermission.objects.get_or_create(
            block=shared_block, user=e2e_admin, defaults={'permission': 'delete'}
        )

        # Добавляем дочерние блоки к корневому
        if block1 not in admin_root.children.all():
            admin_root.add_child(block1)
        if block2 not in admin_root.children.all():
            admin_root.add_child(block2)
        if shared_block not in admin_root.children.all():
            admin_root.add_child(shared_block)

        # ===== 2. Создаём e2e_editor =====
        e2e_editor, editor_created = User.objects.get_or_create(
            username='e2e_editor',
            defaults={'email': 'e2e_editor@test.local'}
        )
        if editor_created:
            e2e_editor.set_password(e2e_editor_password)
            e2e_editor.save()
            self.stdout.write(self.style.SUCCESS('E2E пользователь e2e_editor создан.'))

        # Корневой блок editor'а
        editor_root, _ = Block.objects.get_or_create(
            title='E2E Editor Root',
            creator=e2e_editor,
            defaults={'content': 'Root block for e2e_editor'}
        )
        BlockPermission.objects.get_or_create(
            block=editor_root, user=e2e_editor, defaults={'permission': 'delete'}
        )

        # Даём editor права на shared_block (edit)
        BlockPermission.objects.get_or_create(
            block=shared_block, user=e2e_editor, defaults={'permission': 'edit'}
        )

        # Создаём ссылку на shared_block в корневом блоке editor'а
        # (чтобы editor видел shared_block в своём дереве)
        shared_link_for_editor, _ = Block.objects.get_or_create(
            title='Link to Shared Block',
            creator=e2e_editor,
            defaults={
                'content': '',
                'data': {'link_to': str(shared_block.id)}  # ссылка на shared_block
            }
        )
        BlockPermission.objects.get_or_create(
            block=shared_link_for_editor, user=e2e_editor, defaults={'permission': 'delete'}
        )
        if shared_link_for_editor not in editor_root.children.all():
            editor_root.add_child(shared_link_for_editor)

        # ===== 3. Создаём e2e_viewer =====
        e2e_viewer, viewer_created = User.objects.get_or_create(
            username='e2e_viewer',
            defaults={'email': 'e2e_viewer@test.local'}
        )
        if viewer_created:
            e2e_viewer.set_password(e2e_viewer_password)
            e2e_viewer.save()
            self.stdout.write(self.style.SUCCESS('E2E пользователь e2e_viewer создан.'))

        # Корневой блок viewer'а
        viewer_root, _ = Block.objects.get_or_create(
            title='E2E Viewer Root',
            creator=e2e_viewer,
            defaults={'content': 'Root block for e2e_viewer'}
        )
        BlockPermission.objects.get_or_create(
            block=viewer_root, user=e2e_viewer, defaults={'permission': 'delete'}
        )

        # Даём viewer права на shared_block (только просмотр)
        BlockPermission.objects.get_or_create(
            block=shared_block, user=e2e_viewer, defaults={'permission': 'view'}
        )

        # Создаём ссылку на shared_block в корневом блоке viewer'а
        shared_link_for_viewer, _ = Block.objects.get_or_create(
            title='Link to Shared Block (View Only)',
            creator=e2e_viewer,
            defaults={
                'content': '',
                'data': {'link_to': str(shared_block.id)}
            }
        )
        BlockPermission.objects.get_or_create(
            block=shared_link_for_viewer, user=e2e_viewer, defaults={'permission': 'delete'}
        )
        if shared_link_for_viewer not in viewer_root.children.all():
            viewer_root.add_child(shared_link_for_viewer)

        self.stdout.write(self.style.SUCCESS(
            f'E2E тестовые данные созданы:\n'
            f'  - e2e_admin: root + 3 дочерних блока (CRUD, Arrows, Shared)\n'
            f'  - e2e_editor: root + ссылка на Shared (права edit)\n'
            f'  - e2e_viewer: root + ссылка на Shared (права view)\n'
        ))
```

## Переменные окружения для K8s

```yaml
env:
  - name: E2E_MODE
    value: "true"
  - name: E2E_ADMIN_PASSWORD
    value: "e2e_admin_password"
  - name: E2E_EDITOR_PASSWORD
    value: "e2e_editor_password"
  - name: E2E_VIEWER_PASSWORD
    value: "e2e_viewer_password"
```

## Структура данных после выполнения

```
e2e_admin (owner):
└── E2E Admin Root (delete)
    ├── Block for CRUD (delete)
    ├── Block for Arrows (delete)
    └── Shared Block (delete) ← editor=edit, viewer=view

e2e_editor:
└── E2E Editor Root (delete)
    └── Link to Shared Block (ссылка на Shared Block)

e2e_viewer:
└── E2E Viewer Root (delete)
    └── Link to Shared Block (View Only) (ссылка на Shared Block)
```
