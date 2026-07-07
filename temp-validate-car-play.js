const mongoose=require('mongoose');
(async ()=>{
  const uri='mongodb+srv://yestime1718_db_user:yestime@cluster0.konrsx0.mongodb.net/';
  await mongoose.connect(uri,{ dbName:'test', autoIndex:false });
  const contribs=mongoose.connection.collection('carcontributions');
  const userId='6a4ca005ee51ddef54a08ffc';
  const now=new Date('2026-07-07T08:15:57.987Z');
  const start=new Date(now); start.setUTCHours(0,0,0,0);
  const end=new Date(start); end.setUTCHours(24,0,0,0);
  const userIdFilter=[userId];
  if(mongoose.Types.ObjectId.isValid(userId)) userIdFilter.unshift(new mongoose.Types.ObjectId(userId));
  console.log('userIdFilter', userIdFilter.map(x=>x.toString()));
  const agg=await contribs.aggregate([ { $match: { userId: { $in: userIdFilter }, createdAt: { $gte:start, $lt:end } } }, { $group: { _id:null, total:{ $sum:'$amount' } } } ]).toArray();
  console.log('agg', agg);
  await mongoose.disconnect();
})();
