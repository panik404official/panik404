"""Meetings: the Google Meet session for each consent form (link, live/ended status, psychologist feedback)."""
from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise.fields.base import OnDelete
from uuid import uuid4
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0007_drop_consent_cnic')]

    initial = False

    operations = [
        ops.CreateModel(
            name='Meeting',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid4, unique=True, db_index=True)),
                ('consent_form', fields.OneToOneField('models.ConsentForm', source_field='consent_form_id', db_constraint=True, to_field='id', related_name='meeting', on_delete=OnDelete.CASCADE)),
                ('psychologist', fields.ForeignKeyField('models.User', source_field='psychologist_id', null=True, db_constraint=True, to_field='id', related_name='meetings', on_delete=OnDelete.SET_NULL)),
                ('client_name', fields.CharField(null=True, max_length=200)),
                ('client_email', fields.CharField(null=True, max_length=320)),
                ('starts_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('ends_at', fields.DatetimeField(auto_now=False, auto_now_add=False)),
                ('time_set_by_admin', fields.BooleanField(default=False)),
                ('status', fields.CharField(default='scheduled', db_index=True, max_length=16)),
                ('meet_url', fields.CharField(null=True, max_length=300)),
                ('link_source', fields.CharField(null=True, max_length=16)),
                ('calendar_event_id', fields.CharField(null=True, max_length=200)),
                ('link_error', fields.CharField(null=True, max_length=500)),
                ('syncing_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('invited_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('started_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('started_how', fields.CharField(null=True, max_length=16)),
                ('ended_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('ended_how', fields.CharField(null=True, max_length=16)),
                ('cancelled_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('feedback', fields.TextField(null=True, unique=False)),
                ('feedback_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('feedback_by', fields.ForeignKeyField('models.User', source_field='feedback_by_id', null=True, db_constraint=True, to_field='id', related_name='meeting_feedback', on_delete=OnDelete.SET_NULL)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'meetings', 'app': 'models', 'pk_attr': 'id', 'table_description': 'The online session for a consent form: a Google Meet link on the Panik calendar, created once the client'},
            bases=['Model'],
        ),
    ]
