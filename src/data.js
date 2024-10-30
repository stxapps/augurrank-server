import { Datastore } from '@google-cloud/datastore';

import { NEWSLETTER_EMAIL, ACTIVE } from './const';

const datastore = new Datastore();

const addNewsletterEmail = async (logKey, email) => {
  const key = datastore.key([NEWSLETTER_EMAIL, email]);
  const data = [
    { name: 'status', value: ACTIVE },
    { name: 'createDate', value: new Date() },
    { name: 'updateDate', value: new Date() },
  ];
  const newEntity = { key, data };

  const transaction = datastore.transaction();
  try {
    await transaction.run();

    const [oldEntity] = await transaction.get(key);
    if (oldEntity) {
      console.log(`(${logKey}) Add newsletter email with duplicate email:`, email);
      return;
    }

    transaction.save(newEntity)
    await transaction.commit();
    console.log(`(${logKey}) Saved to Datastore`);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const data = { addNewsletterEmail };

export default data;
