"""Coupons: discount codes admins create; customers apply them at checkout."""
from tortoise import migrations
from tortoise.migrations import operations as ops
import functools
from json import dumps, loads
from tortoise.fields.base import OnDelete
from uuid import uuid4
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0008_meetings')]

    initial = False

    operations = [
        ops.CreateModel(
            name='Coupon',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid4, unique=True, db_index=True)),
                ('code', fields.CharField(unique=True, max_length=40)),
                ('discount_type', fields.CharField(max_length=8)),
                ('value', fields.DecimalField(max_digits=12, decimal_places=2)),
                ('applies_to', fields.JSONField(default=list, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('active', fields.BooleanField(default=True)),
                ('starts_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('expires_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('max_uses', fields.IntField(null=True)),
                ('uses', fields.IntField(default=0)),
                ('note', fields.CharField(null=True, max_length=200)),
                ('created_by', fields.ForeignKeyField('models.User', source_field='created_by_id', null=True, db_constraint=True, to_field='id', related_name='coupons', on_delete=OnDelete.SET_NULL)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'coupons', 'app': 'models', 'pk_attr': 'id', 'table_description': 'A discount code made by an admin. Customers type it at checkout; the server checks it and takes the'},
            bases=['Model'],
        ),
    ]
