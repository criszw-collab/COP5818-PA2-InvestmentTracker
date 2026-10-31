const test = require('node:test');
const assert = require('node:assert/strict');
const {validatePurchase} = require('./validation');
test('valid purchase and trimmed name',()=> {
  assert.deepEqual(validatePurchase({name:' Fund ',quantity:5,unitPriceCents:2000,categoryId:1},[1,2,3]),
    {value:{name:'Fund',quantity:5,unitPriceCents:2000,categoryId:1}});
});
test('invalid quantity and unchanged input',()=> {
  for (const quantity of [0,1.5,10001,'5',true,null,NaN,Infinity]) {
    const body={name:'Fund',quantity,unitPriceCents:2000,categoryId:1};
    assert.ok(validatePurchase(body,[1,2,3]).error);
    assert.ok(Object.is(body.quantity,quantity));
  }
});
test('invalid price and category',()=> {
  for (const cents of [0,1.5,100000001,'100',true]) {
    assert.ok(validatePurchase({name:'Fund',quantity:1,unitPriceCents:cents,categoryId:1},[1,2,3]).error);
  }
  assert.ok(validatePurchase({name:'Fund',quantity:1,unitPriceCents:100,categoryId:99},[1,2,3]).error);
});

test('body and name boundaries',()=>{
  for(const body of [null,undefined,[],true,5,'purchase',{}]) assert.ok(validatePurchase(body,[1]).error);
  for(const name of ['', '   ', 'x'.repeat(101),null,true,3]) assert.ok(validatePurchase({name,quantity:1,unitPriceCents:1,categoryId:1},[1]).error);
  const body={name:'x'.repeat(100),quantity:10000,unitPriceCents:100000000,categoryId:1,ownerId:999,costCents:0,id:999};
  const before=structuredClone(body);
  assert.deepEqual(validatePurchase(body,[1]),{value:{name:body.name,quantity:10000,unitPriceCents:100000000,categoryId:1}});
  assert.deepEqual(body,before);
});
test('every numeric field rejects nonnumeric and missing values',()=>{
  for(const field of ['quantity','unitPriceCents','categoryId']){
    for(const value of [undefined,null,true,false,'1',NaN,Infinity,-Infinity,{},[]]){
      assert.ok(validatePurchase({name:'Fund',quantity:1,unitPriceCents:1,categoryId:1,[field]:value},[1]).error);
    }
  }
});
