from tortoise import migrations
from tortoise.migrations import operations as ops
import functools
from json import dumps, loads
from tortoise.fields.base import OnDelete
from uuid import uuid4
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0002_partition_events_and_seed')]

    initial = False

    operations = [
        ops.CreateModel(
            name='ConsentForm',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid4, unique=True, db_index=True)),
                ('token', fields.CharField(unique=True, max_length=64)),
                ('status', fields.CharField(default='open', db_index=True, max_length=16)),
                ('note', fields.CharField(null=True, max_length=200)),
                ('data', fields.JSONField(default=dict, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('reference', fields.CharField(null=True, max_length=32)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('expires_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('first_opened_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('last_opened_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('completed_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('revoked_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('emailed_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'consent_forms', 'app': 'models', 'pk_attr': 'id', 'table_description': 'An informed-consent form opened through a private link that an admin generates.'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='ContactMessage',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid4, unique=True, db_index=True)),
                ('visitor', fields.ForeignKeyField('models.Visitor', source_field='visitor_id', null=True, db_constraint=True, to_field='id', related_name='contact_messages', on_delete=OnDelete.SET_NULL)),
                ('name', fields.CharField(max_length=120)),
                ('email', fields.CharField(max_length=320)),
                ('phone', fields.CharField(null=True, max_length=32)),
                ('topic', fields.CharField(max_length=40)),
                ('message', fields.TextField(unique=False)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
            ],
            options={'table': 'contact_messages', 'app': 'models', 'pk_attr': 'id', 'table_description': 'A message sent from the Contact us page (emailed to the team, kept here for the admin panel).'},
            bases=['Model'],
        ),
    ]
