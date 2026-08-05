import Setting from '../../model/settingModel.js';
import { success } from '../../utility/academyAuth.js';
export async function update(req,res) {
  const data = { ...req.body };
  delete data.key;
  if (req.file) data.qrImage = `/uploads/settings/${req.file.filename}`;
  return success(res,'Settings updated',await Setting.findOneAndUpdate({key:'application'},{$set:data,$setOnInsert:{key:'application'}},{upsert:true,new:true,runValidators:true}));
}
