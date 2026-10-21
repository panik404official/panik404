from tortoise import migrations
from tortoise.migrations import operations as ops

class Migration(migrations.Migration):
    dependencies = [('models', '0004_partner_verifications')]

    initial = False

    operations = [
        ops.AlterModelOptions(
            name='PartnerVerification',
            options={'table': 'partner_verifications', 'app': 'models', 'pk_attr': 'id', 'table_description': "A partner employee's ID number and ID card photo, uploaded before the discounted booking form opens."},
        ),
        ops.RemoveField(model_name='PartnerVerification', name='department'),
        ops.RemoveField(model_name='PartnerVerification', name='email'),
        ops.RemoveField(model_name='PartnerVerification', name='name'),
        ops.RemoveField(model_name='PartnerVerification', name='phone'),
    ]
