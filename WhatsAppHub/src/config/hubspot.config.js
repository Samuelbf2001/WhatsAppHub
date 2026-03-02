import dotenv from 'dotenv';
dotenv.config();

export const hubspotConfig = {
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  scope: process.env.SCOPE || 'crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write',
  redirectUri: process.env.REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/oauth-callback`
};
