// Validate JSON types before applying bounds; never coerce API input.
function validatePurchase(body, validCategoryIds) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {error:'Purchase must be an object'};
  if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.trim().length > 100) return {error:'Name must contain 1–100 characters'};
  if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 10000) return {error:'Quantity must be an integer from 1 to 10,000'};
  if (!Number.isInteger(body.unitPriceCents) || body.unitPriceCents < 1 || body.unitPriceCents > 100000000) return {error:'Price in cents must be an integer from 1 to 100,000,000'};
  if (!Number.isInteger(body.categoryId) || !validCategoryIds.includes(body.categoryId)) return {error:'Choose an existing category'};
  return {value:{name:body.name.trim(),quantity:body.quantity,unitPriceCents:body.unitPriceCents,categoryId:body.categoryId}};
}
module.exports={validatePurchase};
