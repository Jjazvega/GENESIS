import { beforeEach, describe, it } from 'node:test';
import {
  assertAllowed,
  assertDenied,
  clearFirestore,
  firestoreCommitSet,
  firestoreDelete,
  firestoreGet,
  firestorePatch,
  firestoreSet,
  seedCompany,
} from './rules-test-utils.mjs';

const companyId = 'company-firestore';
const otherCompanyId = 'company-other';
const claimVersions = { membershipVersion: 1, companyVersion: 1, claimsVersion: 1 };
const owner = { uid: 'owner-uid', claims: { email: 'owner@gemailla.test', email_verified: true, companyId, ...claimVersions, companyRole: 'owner', membershipStatus: 'active' } };
const director = { uid: 'director-uid', claims: { email: 'director@gemailla.test', email_verified: true, companyId, ...claimVersions, companyRole: 'director', membershipStatus: 'active' } };
const admin = { uid: 'admin-uid', claims: { email: 'admin@gemailla.test', email_verified: true, companyId, ...claimVersions, companyRole: 'admin', membershipStatus: 'active' } };
const editor = { uid: 'editor-uid', claims: { email: 'editor@gemailla.test', email_verified: true, companyId, ...claimVersions, companyRole: 'editor', membershipStatus: 'active' } };
const viewer = { uid: 'viewer-uid', claims: { email: 'viewer@gemailla.test', email_verified: true, companyId, ...claimVersions, companyRole: 'viewer', membershipStatus: 'active' } };
const inactive = { uid: 'inactive-uid', claims: { email: 'inactive@gemailla.test', email_verified: true, companyId, ...claimVersions, companyRole: 'editor', membershipStatus: 'active' } };
const outsider = { uid: 'outsider-uid', claims: { email: 'outsider@gemailla.test', email_verified: true, companyId: otherCompanyId, ...claimVersions, companyRole: 'admin', membershipStatus: 'active' } };
const noMembership = { uid: 'no-membership-uid', claims: { email: 'no-membership@gemailla.test', email_verified: true, companyId, ...claimVersions, companyRole: 'admin', membershipStatus: 'active' } };
const legacyEmailUser = { uid: 'legacy-new-uid', claims: { email: 'legacy@gemailla.test', email_verified: true, companyId, ...claimVersions, companyRole: 'director', membershipStatus: 'active' } };

async function seedFirestoreAcl() {
  await seedCompany({
    companyId,
    ownerUid: owner.uid,
    memberships: [
      { userUid: director.uid, userEmail: director.claims.email, role: 'director', status: 'active' },
      { userUid: admin.uid, userEmail: admin.claims.email, role: 'admin', status: 'active' },
      { userUid: editor.uid, userEmail: editor.claims.email, role: 'editor', status: 'active' },
      { userUid: viewer.uid, userEmail: viewer.claims.email, role: 'viewer', status: 'active' },
      { userUid: inactive.uid, userEmail: inactive.claims.email, role: 'editor', status: 'archived' },
      {
        id: `${companyId}_legacy_email_only`,
        userEmail: legacyEmailUser.claims.email,
        role: 'director',
        status: 'active',
      },
    ],
  });

  await seedCompany({ companyId: otherCompanyId, ownerUid: 'other-owner-uid' });

  await assertAllowed(firestoreSet('documents/protected-doc', {
    companyId,
    ownerUid: owner.uid,
    title: 'Documento protegido',
    status: 'active',
    contentType: 'application/pdf',
    fileSize: 100,
    storagePath: `companies/${companyId}/documents/protected-doc/file.pdf`,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: owner.uid,
  }), 'admin protected document seed');

  await assertAllowed(firestoreSet('transactions/protected-tx', {
    companyId,
    ownerUid: owner.uid,
    status: 'active',
    type: 'ingreso',
    amount: 100,
  }), 'admin protected transaction seed');


  await assertAllowed(firestoreSet('aiUsage/company-usage', {
    companyId,
    tokens: 100,
  }), 'admin company ai usage seed');

  await assertAllowed(firestoreSet('aiUsage/other-company-usage', {
    companyId: otherCompanyId,
    tokens: 200,
  }), 'admin other company ai usage seed');

  await assertAllowed(firestoreSet('aiUsage/usage-without-company', {
    tokens: 300,
  }), 'admin ai usage without company seed');

  await assertAllowed(firestoreSet('aiCostLogs/company-cost-log', {
    companyId,
    estimatedCostUsd: 1.25,
    totalTokens: 1200,
  }), 'admin company ai cost log seed');

  await assertAllowed(firestoreSet('aiAuditLogs/company-audit-log', {
    companyId,
    eventName: 'ai_request_completed',
    status: 'ok',
  }), 'admin company ai audit log seed');

  await assertAllowed(firestoreSet('aiCostLogs/other-company-cost-log', {
    companyId: otherCompanyId,
    estimatedCostUsd: 2.25,
  }), 'admin other company ai cost log seed');

  await assertAllowed(firestoreSet('aiAuditLogs/audit-log-without-company', {
    eventName: 'ai_request_completed',
    status: 'ok',
  }), 'admin ai audit log without company seed');

  await assertAllowed(firestoreSet('aiBudgets/company-budget', {
    companyId,
    dailyLimitUsd: 25,
  }), 'admin company ai budget seed');

  await assertAllowed(firestoreSet('aiBudgets/other-company-budget', {
    companyId: otherCompanyId,
    dailyLimitUsd: 50,
  }), 'admin other company ai budget seed');

  await assertAllowed(firestoreSet('aiBudgets/budget-without-company', {
    dailyLimitUsd: 75,
  }), 'admin ai budget without company seed');
}

async function assertAiFinancialReadAllowed(user, label) {
  await assertAllowed(firestoreGet('aiUsage/company-usage', user), `${label} ai usage read`);
  await assertAllowed(firestoreGet('aiBudgets/company-budget', user), `${label} ai budget read`);
  await assertAllowed(firestoreGet('aiCostLogs/company-cost-log', user), `${label} ai cost log read`);
  await assertAllowed(firestoreGet('aiAuditLogs/company-audit-log', user), `${label} ai audit log read`);
}

async function assertAiFinancialReadDenied(user, label) {
  await assertDenied(firestoreGet('aiUsage/company-usage', user), `${label} ai usage read`);
  await assertDenied(firestoreGet('aiBudgets/company-budget', user), `${label} ai budget read`);
  await assertDenied(firestoreGet('aiCostLogs/company-cost-log', user), `${label} ai cost log read`);
  await assertDenied(firestoreGet('aiAuditLogs/company-audit-log', user), `${label} ai audit log read`);
}

describe('Firestore security rules', () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedFirestoreAcl();
  });


  it('restricts AI financial reads to active company administrators', async () => {
    await assertAiFinancialReadAllowed(owner, 'owner');
    await assertAiFinancialReadAllowed(director, 'director');
    await assertAiFinancialReadAllowed(admin, 'admin');

    await assertAiFinancialReadDenied(editor, 'editor');
    await assertAiFinancialReadDenied(viewer, 'viewer');
    await assertAiFinancialReadDenied(inactive, 'inactive member');
    await assertAiFinancialReadDenied(outsider, 'other company user');
    await assertAiFinancialReadDenied(null, 'anonymous user');
  });

  it('denies AI financial reads for other companies and documents without companyId', async () => {
    await assertDenied(firestoreGet('aiUsage/other-company-usage', admin), 'admin other company ai usage read');
    await assertDenied(firestoreGet('aiBudgets/other-company-budget', admin), 'admin other company ai budget read');
    await assertDenied(firestoreGet('aiCostLogs/other-company-cost-log', admin), 'admin other company ai cost log read');
    await assertDenied(firestoreGet('aiAuditLogs/audit-log-without-company', admin), 'admin ai audit log without company read');
    await assertDenied(firestoreGet('aiUsage/usage-without-company', admin), 'admin ai usage without company read');
    await assertDenied(firestoreGet('aiBudgets/budget-without-company', admin), 'admin ai budget without company read');
  });

  it('keeps AI usage backend-write-only and AI budget writes admin-only', async () => {
    await assertDenied(firestoreSet('aiUsage/client-created-usage', {
      companyId,
      tokens: 100,
    }, admin), 'client ai usage create');
    await assertDenied(firestorePatch('aiUsage/company-usage', {
      companyId,
      tokens: 150,
    }, admin), 'client ai usage update');
    await assertDenied(firestoreDelete('aiUsage/company-usage', admin), 'client ai usage delete');
    await assertDenied(firestoreSet('aiCostLogs/client-created-cost-log', {
      companyId,
      estimatedCostUsd: 1,
    }, admin), 'client ai cost log create');
    await assertDenied(firestoreSet('aiAuditLogs/client-created-audit-log', {
      companyId,
      eventName: 'ai_request_completed',
    }, admin), 'client ai audit log create');

    await assertDenied(firestoreSet('aiBudgets/viewer-created-budget', {
      companyId,
      dailyLimitUsd: 999,
    }, viewer), 'viewer ai budget create');
    await assertDenied(firestorePatch('aiBudgets/company-budget', {
      companyId,
      dailyLimitUsd: 999,
    }, viewer), 'viewer ai budget update');
  });

  it('allows a signed-in user without company claims to create a company with their initial owner membership atomically', async () => {
    const newOwner = { uid: 'new-owner-uid', claims: { email: 'new-owner@gemailla.test', email_verified: true } };
    const newCompanyId = 'new-company-bootstrap';

    await assertAllowed(firestoreCommitSet([
      {
        path: `companies/${newCompanyId}`,
        data: {
          name: 'Empresa bootstrap',
          ownerUid: newOwner.uid,
          status: 'active',
          createdBy: newOwner.uid,
        },
      },
      {
        path: `companyMembers/${newCompanyId}_${newOwner.uid}`,
        data: {
          companyId: newCompanyId,
          userUid: newOwner.uid,
          userEmail: newOwner.claims.email,
          role: 'director',
          status: 'active',
          createdBy: newOwner.uid,
        },
      },
    ], newOwner), 'initial company and owner membership bootstrap');
  });

  it('allows the active owner to read and write their company without changing ownerUid', async () => {
    await assertAllowed(firestoreGet(`companies/${companyId}`, owner), 'owner company read');
    await assertAllowed(firestorePatch(`companies/${companyId}`, {
      name: 'Empresa actualizada por owner',
      ownerUid: owner.uid,
      status: 'active',
    }, owner), 'owner company update');
    await assertDenied(firestoreDelete(`companies/${companyId}`, owner), 'owner physical company delete');
  });

  it('allows an active admin to manage permitted resources', async () => {
    await assertAllowed(firestoreSet(`companyMembers/${companyId}_new_viewer`, {
      companyId,
      userUid: 'new-viewer-uid',
      userEmail: 'new-viewer@gemailla.test',
      role: 'viewer',
      status: 'pending',
      createdBy: admin.uid,
    }, admin), 'admin membership invite create');

    await assertAllowed(firestorePatch(`companyMembers/${companyId}_${viewer.uid}`, {
      companyId,
      userUid: viewer.uid,
      userEmail: viewer.claims.email,
      role: 'editor',
      status: 'active',
      updatedBy: admin.uid,
    }, admin), 'admin membership role update');
  });

  it('prevents non-owner administrators from granting the owner role', async () => {
    await assertDenied(firestoreSet(`companyMembers/${companyId}_admin_owner_invite`, {
      companyId,
      userUid: 'admin-owner-invite-uid',
      userEmail: 'admin-owner-invite@gemailla.test',
      role: 'owner',
      status: 'pending',
      createdBy: admin.uid,
    }, admin), 'admin owner membership invite create');

    await assertDenied(firestorePatch(`companyMembers/${companyId}_${viewer.uid}`, {
      companyId,
      userUid: viewer.uid,
      userEmail: viewer.claims.email,
      role: 'owner',
      status: 'active',
      updatedBy: admin.uid,
    }, admin), 'admin owner role escalation update');

    await assertDenied(firestorePatch(`companyMembers/${companyId}_${owner.uid}`, {
      companyId,
      userUid: owner.uid,
      role: 'director',
      status: 'active',
      updatedBy: admin.uid,
    }, admin), 'admin owner membership demotion update');
  });

  it('allows an active editor to modify permitted documents', async () => {
    await assertAllowed(firestoreGet('documents/protected-doc', editor), 'editor document read');
    await assertAllowed(firestorePatch('documents/protected-doc', {
      companyId,
      ownerUid: owner.uid,
      title: 'Documento actualizado por editor',
      status: 'active',
      contentType: 'application/pdf',
      fileSize: 100,
      storagePath: `companies/${companyId}/documents/protected-doc/file.pdf`,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: owner.uid,
      updatedBy: editor.uid,
    }, editor), 'editor document update');
  });

  it('allows a viewer to read but not write permitted company records', async () => {
    await assertAllowed(firestoreGet('documents/protected-doc', viewer), 'viewer document read');
    await assertDenied(firestorePatch('documents/protected-doc', {
      companyId,
      ownerUid: owner.uid,
      title: 'Viewer no puede escribir',
      status: 'active',
      contentType: 'application/pdf',
      fileSize: 100,
      storagePath: `companies/${companyId}/documents/protected-doc/file.pdf`,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: owner.uid,
      updatedBy: viewer.uid,
    }, viewer), 'viewer document update');
  });

  it('allows an active director to access permitted company collections', async () => {
    await assertAllowed(firestoreGet('documents/protected-doc', director), 'director document read');

    await assertAllowed(firestoreSet('transactions/director-created-tx', {
      companyId,
      ownerUid: director.uid,
      status: 'active',
      type: 'gasto',
      amount: 25,
    }, director), 'director transaction create');
    await assertAllowed(firestoreGet('transactions/protected-tx', director), 'director transaction read');
  });

  it('denies reads and writes from unauthenticated requests', async () => {
    await assertDenied(firestoreGet(`companies/${companyId}`, null), 'anonymous company read');
    await assertDenied(firestoreSet('documents/anonymous-doc', {
      companyId,
      ownerUid: 'anonymous',
      title: 'No autenticado',
      status: 'uploading',
      contentType: 'application/pdf',
      fileSize: 100,
    }, null), 'anonymous document create');
  });

  it('denies users from other companies', async () => {
    await seedCompany({ companyId: 'company-foreign', ownerUid: 'foreign-owner-uid', memberships: [
      { userUid: outsider.uid, userEmail: outsider.claims.email, role: 'admin', status: 'active' },
    ] });

    await assertDenied(firestoreGet('documents/protected-doc', outsider), 'other company admin document read');
    await assertDenied(firestorePatch('transactions/protected-tx', {
      companyId,
      ownerUid: owner.uid,
      status: 'active',
      type: 'ingreso',
      amount: 300,
    }, outsider), 'other company admin transaction update');
  });

  it('denies editor administration actions', async () => {
    await assertDenied(firestoreSet(`companyMembers/${companyId}_editor_invite`, {
      companyId,
      userUid: 'editor-invite-uid',
      userEmail: 'editor-invite@gemailla.test',
      role: 'viewer',
      status: 'pending',
      createdBy: editor.uid,
    }, editor), 'editor membership invite create');

    await assertDenied(firestorePatch(`companies/${companyId}`, {
      name: 'Editor no administra empresa',
      ownerUid: owner.uid,
      status: 'active',
      updatedBy: editor.uid,
    }, editor), 'editor company update');
  });

  it('denies protected field changes and cross-company writes', async () => {
    await assertDenied(firestorePatch('documents/protected-doc', {
      companyId,
      ownerUid: owner.uid,
      title: 'Intenta cambiar createdAt',
      status: 'active',
      contentType: 'application/pdf',
      fileSize: 100,
      storagePath: `companies/${companyId}/documents/protected-doc/file.pdf`,
      createdAt: '2026-02-01T00:00:00.000Z',
      createdBy: owner.uid,
      updatedBy: editor.uid,
    }, editor), 'editor protected createdAt change');

    await assertDenied(firestorePatch('documents/protected-doc', {
      companyId: otherCompanyId,
      ownerUid: owner.uid,
      title: 'Intenta mover tenant',
      status: 'active',
      contentType: 'application/pdf',
      fileSize: 100,
      storagePath: `companies/${otherCompanyId}/documents/protected-doc/file.pdf`,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: owner.uid,
      updatedBy: editor.uid,
    }, editor), 'editor cross-company document update');

    await assertDenied(firestoreSet('documents/cross-company-create', {
      companyId: otherCompanyId,
      ownerUid: editor.uid,
      title: 'Alta cruzada no permitida',
      status: 'uploading',
      contentType: 'application/pdf',
      fileSize: 100,
    }, editor), 'editor cross-company document create');
  });

  it('denies protected company data to an inactive member', async () => {
    await assertDenied(firestoreGet('documents/protected-doc', inactive), 'inactive member document read');
    await assertDenied(firestorePatch('transactions/protected-tx', {
      companyId,
      ownerUid: owner.uid,
      status: 'active',
      type: 'ingreso',
      amount: 200,
    }, inactive), 'inactive member transaction update');
  });

  it('denies protected company data to a user without membership', async () => {
    await assertDenied(firestoreGet('documents/protected-doc', outsider), 'outsider document read');
    await assertDenied(firestoreSet('documents/outsider-created-doc', {
      companyId,
      ownerUid: outsider.uid,
      title: 'No permitido',
      status: 'active',
      contentType: 'application/pdf',
      fileSize: 100,
      storagePath: `companies/${companyId}/documents/outsider-created-doc/file.pdf`,
    }, outsider), 'outsider document create');
  });

  it('does not allow legacy email-only users to access protected data without a consolidated UID membership', async () => {
    await assertDenied(
      firestoreGet(`companyMembers/${companyId}_legacy_email_only`, legacyEmailUser),
      'legacy email-only user cannot read an email-only membership record',
    );
    await assertDenied(firestoreGet('documents/protected-doc', legacyEmailUser), 'legacy email-only user document read');
    await assertDenied(firestoreGet('transactions/protected-tx', legacyEmailUser), 'legacy email-only user transaction read');
  });

  it('allows UID-based member reads when the auth token has no email claim', async () => {
    const noEmailViewer = { uid: viewer.uid, claims: { email_verified: true, companyId, ...claimVersions, companyRole: 'viewer', membershipStatus: 'active' } };

    await assertAllowed(
      firestoreGet(`companyMembers/${companyId}_${viewer.uid}`, noEmailViewer),
      'uid member can read their membership without email claim',
    );
    await assertAllowed(firestoreGet('documents/protected-doc', noEmailViewer), 'uid member can read document without email claim');
    await assertDenied(
      firestoreGet(`companyMembers/${companyId}_legacy_email_only`, noEmailViewer),
      'uid member without email claim cannot read unrelated email-only membership',
    );
  });

  it('denies company records when the auth companyId claim does not match the document tenant', async () => {
    const mismatchedEditor = {
      uid: editor.uid,
      claims: { email: editor.claims.email, email_verified: true, companyId: otherCompanyId, companyRole: 'editor', membershipStatus: 'active' },
    };

    await assertDenied(firestoreGet('documents/protected-doc', mismatchedEditor), 'mismatched claim document read');
    await assertDenied(firestorePatch('transactions/protected-tx', {
      companyId,
      ownerUid: owner.uid,
      status: 'active',
      type: 'ingreso',
      amount: 400,
    }, mismatchedEditor), 'mismatched claim transaction update');
  });

  it('denies protected company data when claim versions are stale', async () => {
    const staleMembershipEditor = {
      uid: editor.uid,
      claims: { ...editor.claims, membershipVersion: 0 },
    };
    const staleCompanyEditor = {
      uid: editor.uid,
      claims: { ...editor.claims, companyVersion: 0 },
    };
    const staleClaimsEditor = {
      uid: editor.uid,
      claims: { ...editor.claims, claimsVersion: 0 },
    };

    await assertDenied(firestoreGet('documents/protected-doc', staleMembershipEditor), 'stale membershipVersion document read');
    await assertDenied(firestoreGet('documents/protected-doc', staleCompanyEditor), 'stale companyVersion document read');
    await assertDenied(firestoreGet('documents/protected-doc', staleClaimsEditor), 'stale claimsVersion document read');
  });

  it('allows company administrators to read AI usage and budgets for their company', async () => {
    for (const [label, user] of [['owner', owner], ['director', director], ['admin', admin]]) {
      await assertAllowed(firestoreGet('aiUsage/company-usage', user), `${label} company ai usage read`);
      await assertAllowed(firestoreGet('aiBudgets/company-budget', user), `${label} company ai budget read`);
    }
  });

  it('denies non-administrators and inactive users from reading AI usage and budgets', async () => {
    for (const [label, user] of [['editor', editor], ['viewer', viewer], ['inactive', inactive], ['no membership', noMembership]]) {
      await assertDenied(firestoreGet('aiUsage/company-usage', user), `${label} company ai usage read`);
      await assertDenied(firestoreGet('aiBudgets/company-budget', user), `${label} company ai budget read`);
    }
  });

  it('denies other-company and anonymous users from reading company AI usage and budgets', async () => {
    await assertDenied(firestoreGet('aiUsage/company-usage', outsider), 'other company admin company ai usage read');
    await assertDenied(firestoreGet('aiBudgets/company-budget', outsider), 'other company admin company ai budget read');
    await assertDenied(firestoreGet('aiUsage/company-usage', null), 'anonymous company ai usage read');
    await assertDenied(firestoreGet('aiBudgets/company-budget', null), 'anonymous company ai budget read');
  });

  it('denies administrators from reading AI usage and budgets outside their company or without companyId', async () => {
    await assertDenied(firestoreGet('aiUsage/other-company-usage', admin), 'admin other company ai usage read');
    await assertDenied(firestoreGet('aiBudgets/other-company-budget', admin), 'admin other company ai budget read');
    await assertDenied(firestoreGet('aiUsage/usage-without-company', admin), 'admin ai usage without company read');
    await assertDenied(firestoreGet('aiBudgets/budget-without-company', admin), 'admin ai budget without company read');
  });

  it('keeps AI usage backend-write-only for clients', async () => {
    await assertDenied(firestoreSet('aiUsage/client-created-usage', {
      companyId,
      tokens: 100,
    }, admin), 'client ai usage create');

    await assertDenied(firestorePatch('aiUsage/company-usage', {
      companyId,
      tokens: 150,
    }, admin), 'client ai usage update');

    await assertDenied(firestoreDelete('aiUsage/company-usage', admin), 'client ai usage delete');
  });

  it('keeps viewers from creating or modifying AI budgets', async () => {
    await assertDenied(firestoreSet('aiBudgets/viewer-budget', {
      companyId,
      dailyLimitUsd: 999,
    }, viewer), 'viewer ai budget create');

    await assertDenied(firestorePatch('aiBudgets/company-budget', {
      companyId,
      dailyLimitUsd: 999,
    }, viewer), 'viewer ai budget update');
  });

  it('blocks user profile role escalation and keeps AI/audit writes backend-only', async () => {
    await assertAllowed(firestoreSet(`users/${viewer.uid}`, {
      displayName: 'Viewer seguro',
      createdBy: viewer.uid,
    }, viewer), 'viewer user profile create without role');

    await assertDenied(firestoreSet(`users/${editor.uid}`, {
      displayName: 'Editor admin falso',
      role: 'admin',
      createdBy: editor.uid,
    }, editor), 'user profile create with role');

    await assertDenied(firestorePatch(`users/${viewer.uid}`, {
      displayName: 'Viewer escalado',
      role: 'admin',
      updatedBy: viewer.uid,
    }, viewer), 'user profile role escalation update');

    await assertDenied(firestoreSet('auditLogs/client-created-log', {
      companyId,
      action: 'client-write',
      createdBy: admin.uid,
    }, admin), 'client audit log write');

    await assertDenied(firestoreSet('aiUsage/client-created-usage', {
      companyId,
      tokens: 100,
    }, admin), 'client ai usage write');

    await assertAllowed(firestoreSet('aiBudgets/company-budget', {
      companyId,
      dailyLimitUsd: 25,
    }, admin), 'admin ai budget write');
    await assertDenied(firestoreSet('aiBudgets/viewer-budget', {
      companyId,
      dailyLimitUsd: 999,
    }, viewer), 'viewer ai budget write');
  });

});
