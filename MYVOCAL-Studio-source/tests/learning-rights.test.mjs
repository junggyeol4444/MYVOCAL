import test from 'node:test';
import assert from 'node:assert/strict';
import {RIGHTS_CATEGORIES, createLearningRights, canUseLearningAsset, assertLearningPermission} from '../src/lib/learningRights.js';
test('four distinct rights categories', () => assert.equal(RIGHTS_CATEGORIES.length, 4));
for (const category of ['self-created', 'self-identity']) {
  test(category + ' permits training after confirmation', () => {
    const r=createLearningRights({category,consentConfirmed:true});
    assert.equal(canUseLearningAsset(r,'model-training'),true);
    assert.equal(canUseLearningAsset(r,'style-learning'),true);
  });
}
test('reference-only cannot train', () => {
 const r=createLearningRights({category:'reference-only',consentConfirmed:true});
 assert.equal(canUseLearningAsset(r,'reference-analysis'),true);
 assert.equal(canUseLearningAsset(r,'model-training'),false);
 assert.throws(()=>assertLearningPermission(r,'model-training'));
});
test('unconfirmed material is denied', () => assert.equal(canUseLearningAsset(createLearningRights({category:'self-created'}),'model-training'),false));
test('licensed requires permission note', () => assert.throws(()=>createLearningRights({category:'licensed',consentConfirmed:true})));
test('licensed note permits training after confirmation', () => assert.equal(canUseLearningAsset(createLearningRights({category:'licensed',consentConfirmed:true,licenseNote:'Written permission'}),'model-training'),true));
test('unknown category rejected', () => assert.throws(()=>createLearningRights({category:'unknown'})));
test('unknown purpose denied', () => assert.equal(canUseLearningAsset(createLearningRights({category:'self-created',consentConfirmed:true}),'upload'),false));
test('metadata is immutable', () => assert.equal(Object.isFrozen(createLearningRights({category:'reference-only'})),true));
test('malformed metadata fails closed', () => assert.equal(canUseLearningAsset({category:'licensed',consentConfirmed:true},'model-training'),false));
