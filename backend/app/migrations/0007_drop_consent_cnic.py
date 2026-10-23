"""Hand-written: the psychologist's CNIC is no longer collected on consent forms.

Strips the `pcnic` key from every consent form already stored, so no existing record keeps it.
Not reversible: the removed values are gone.
"""
from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0006_panel_users_and_notifications")]

    operations = [
        ops.RunSQL(
            ["UPDATE consent_forms SET data = data - 'pcnic' WHERE jsonb_exists(data, 'pcnic')"],
            reverse_sql=None,
        ),
    ]
