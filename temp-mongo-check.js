const mongoose = require('mongoose');
(async () => {
  const uri = 'mongodb+srv://yestime1718_db_user:yestime@cluster0.konrsx0.mongodb.net/';
  await mongoose.connect(uri, { dbName: 'test', autoIndex: false });
  const contrib = mongoose.connection.collection('carcontributions');
  const userId = '6a4ca005ee51ddef54a08ffc';
  const now = new Date('2026-07-07T08:15:57.987Z');
  const start = new Date(now);
  start.setUTCHours(0,0,0,0);
  const end = new Date(start);
  end.setUTCHours(24,0,0,0);
  console.log('utc range', start.toISOString(), end.toISOString());
  const docs = await contrib.find({ userId: new mongoose.Types.ObjectId(userId), createdAt: { $gte: start, $lt: end }}).toArray();
  console.log('count', docs.length);
  docs.forEach(d => console.log({ _id:d._id.toString(), amount:d.amount, createdAt:d.createdAt, userId:d.userId.toString() }));
  const agg = await contrib.aggregate([ { $match: { userId: new mongoose.Types.ObjectId(userId), createdAt: { $gte: start, $lt: end } } }, { $group: { _id: null, total: { $sum: '$amount' } } } ]).toArray();
  console.log('agg', agg);
  await mongoose.disconnect();
})().catch(err => { console.error(err); process.exit(1); });
