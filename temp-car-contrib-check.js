const mongoose = require('mongoose');
(async ()=>{
  const uri='mongodb+srv://yestime1718_db_user:yestime@cluster0.konrsx0.mongodb.net/';
  await mongoose.connect(uri,{ dbName:'test', autoIndex:false });
  const collections=await mongoose.connection.db.listCollections().toArray();
  console.log('collections', collections.map(c=>c.name));
  const contribs = mongoose.connection.collection('carcontributions');
  const userId='6a4ca005ee51ddef54a08ffc';
  const docs=await contribs.find({ userId: new mongoose.Types.ObjectId(userId)}).toArray();
  console.log('total docs by user', docs.length);
  docs.forEach(d=>console.log('doc', { _id:d._id.toString(), amount:d.amount, createdAt:d.createdAt, updatedAt:d.updatedAt, date:d.date, userId: d.userId ? d.userId.toString() : d.userId, carParticipationId: d.carParticipationId ? d.carParticipationId.toString() : d.carParticipationId }));
  const byId=await contribs.findOne({ _id: new mongoose.Types.ObjectId('6a4cb5bdee51ddef54a092d7') });
  console.log('find by id', byId ? { _id:byId._id.toString(), amount:byId.amount, createdAt:byId.createdAt, date:byId.date } : null);
  await mongoose.disconnect();
})();
