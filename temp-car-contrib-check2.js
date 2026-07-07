const mongoose = require('mongoose');
(async ()=>{
  const uri='mongodb+srv://yestime1718_db_user:yestime@cluster0.konrsx0.mongodb.net/';
  await mongoose.connect(uri,{ dbName:'test', autoIndex:false });
  const contribs = mongoose.connection.collection('carcontributions');
  const byId = await contribs.findOne({ _id: new mongoose.Types.ObjectId('6a4cb5bdee51ddef54a092d7') });
  console.log('raw doc', byId);
  if (byId) {
    console.log('userId type', typeof byId.userId, byId.userId && byId.userId.constructor && byId.userId.constructor.name);
    console.log('userId value', byId.userId);
    console.log('match by string', await contribs.findOne({ userId: byId.userId }));
    try { console.log('match by ObjectId', await contribs.findOne({ userId: new mongoose.Types.ObjectId('6a4ca005ee51ddef54a08ffc') })); } catch(e) { console.error('objectid query error', e); }
  }
  await mongoose.disconnect();
})();
