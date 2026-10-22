from tortoise import migrations
from tortoise.migrations import operations as ops
import functools
from json import dumps, loads
from tortoise.fields.base import OnDelete
from uuid import uuid4
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0005_partner_employee_id_only')]

    initial = False

    operations = [
        ops.CreateModel(
            name='User',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid4, unique=True, db_index=True)),
                ('username', fields.CharField(unique=True, max_length=40)),
                ('email', fields.CharField(unique=True, max_length=320)),
                ('name', fields.CharField(max_length=120)),
                ('role', fields.CharField(default='psychologist', max_length=16)),
                ('permissions', fields.JSONField(default=list, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('qualification', fields.CharField(null=True, max_length=120)),
                ('password_hash', fields.CharField(max_length=255)),
                ('is_active', fields.BooleanField(default=True)),
                ('created_by', fields.ForeignKeyField('models.User', source_field='created_by_id', null=True, db_constraint=True, to_field='id', related_name='users_created', on_delete=OnDelete.SET_NULL)),
                ('last_login_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'users', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Someone who signs in to the admin panel. role "admin" can do everything (including managing users);'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='Notification',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid4, unique=True, db_index=True)),
                ('user', fields.ForeignKeyField('models.User', source_field='user_id', db_constraint=True, to_field='id', related_name='notifications', on_delete=OnDelete.CASCADE)),
                ('kind', fields.CharField(max_length=40)),
                ('title', fields.CharField(max_length=200)),
                ('body', fields.TextField(null=True, unique=False)),
                ('link', fields.CharField(null=True, max_length=300)),
                ('read_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
            ],
            options={'table': 'notifications', 'app': 'models', 'pk_attr': 'id', 'table_description': 'An in-panel notification (the bell). Emails are sent alongside, best effort.'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='UserSession',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid4, unique=True, db_index=True)),
                ('user', fields.ForeignKeyField('models.User', source_field='user_id', db_constraint=True, to_field='id', related_name='sessions', on_delete=OnDelete.CASCADE)),
                ('token_hash', fields.CharField(unique=True, max_length=64)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('expires_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('last_seen_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('user_agent', fields.CharField(null=True, max_length=200)),
            ],
            options={'table': 'user_sessions', 'app': 'models', 'pk_attr': 'id', 'table_description': "A signed-in browser. Only a SHA-256 of the token is stored, so a database leak can't be replayed."},
            bases=['Model'],
        ),
        ops.AddField(
            model_name='ConsentForm',
            name='assigned_at',
            field=fields.DatetimeField(null=True, auto_now=False, auto_now_add=False),
        ),
        ops.AddField(
            model_name='ConsentForm',
            name='assigned_by',
            field=fields.ForeignKeyField('models.User', source_field='assigned_by_id', null=True, db_constraint=True, to_field='id', related_name='consent_assignments_made', on_delete=OnDelete.SET_NULL),
        ),
        ops.AddField(
            model_name='ConsentForm',
            name='assigned_to',
            field=fields.ForeignKeyField('models.User', source_field='assigned_to_id', null=True, db_constraint=True, to_field='id', related_name='assigned_consent_forms', on_delete=OnDelete.SET_NULL),
        ),
        ops.AddField(
            model_name='ConsentForm',
            name='submitted_at',
            field=fields.DatetimeField(null=True, auto_now=False, auto_now_add=False),
        ),
    ]
