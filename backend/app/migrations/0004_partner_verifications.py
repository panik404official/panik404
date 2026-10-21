from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise.fields.base import OnDelete
from uuid import uuid4
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0003_consent_forms_and_contact')]

    initial = False

    operations = [
        ops.CreateModel(
            name='PartnerVerification',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid4, unique=True, db_index=True)),
                ('partner', fields.CharField(db_index=True, max_length=32)),
                ('status', fields.CharField(default='pending', db_index=True, max_length=16)),
                ('visitor', fields.ForeignKeyField('models.Visitor', source_field='visitor_id', null=True, db_constraint=True, to_field='id', related_name='partner_verifications', on_delete=OnDelete.SET_NULL)),
                ('name', fields.CharField(max_length=120)),
                ('email', fields.CharField(max_length=320)),
                ('phone', fields.CharField(null=True, max_length=32)),
                ('employee_id', fields.CharField(max_length=64)),
                ('department', fields.CharField(null=True, max_length=120)),
                ('file_name', fields.CharField(max_length=120)),
                ('file_mime', fields.CharField(max_length=64)),
                ('file_size', fields.IntField()),
                ('file_data', fields.BinaryField()),
                ('order', fields.OneToOneField('models.Order', source_field='order_id', null=True, db_constraint=True, to_field='id', related_name='partner_verification', on_delete=OnDelete.SET_NULL)),
                ('used_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('admin_note', fields.CharField(null=True, max_length=500)),
                ('reviewed_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'partner_verifications', 'app': 'models', 'pk_attr': 'id', 'table_description': "A partner employee's details and ID document, uploaded before the discounted booking form opens."},
            bases=['Model'],
        ),
    ]
