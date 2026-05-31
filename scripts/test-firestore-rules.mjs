import fs from 'node:fs/promises';
import path from 'node:path';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';

const projectId = process.env.FIREBASE_RULES_TEST_PROJECT_ID || 'demo-estatepulse';
const rulesPath = path.join(process.cwd(), 'firestore.rules');

async function seedBaseData(testEnv) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const now = Timestamp.now();

    await setDoc(doc(db, 'users', 'admin_uid'), {
      name: 'Admin User',
      email: 'admin@estatepulse.com',
      phone: '9000000000',
      role: 'admin',
      clientId: 'client_a',
      createdAt: now,
    });

    await setDoc(doc(db, 'users', 'emp1_uid'), {
      name: 'Employee One',
      email: '1111111111@estatepulse.com',
      phone: '1111111111',
      role: 'employee',
      clientId: 'client_a',
      createdAt: now,
    });

    await setDoc(doc(db, 'users', 'emp2_uid'), {
      name: 'Employee Two',
      email: '2222222222@estatepulse.com',
      phone: '2222222222',
      role: 'employee',
      clientId: 'client_a',
      createdAt: now,
    });

    await setDoc(doc(db, 'employeeDirectory', 'emp1_uid'), {
      name: 'Employee One',
      phone: '1111111111',
      role: 'employee',
      clientId: 'client_a',
      updatedAt: now,
    });

    await setDoc(doc(db, 'employeeDirectory', 'emp2_uid'), {
      name: 'Employee Two',
      phone: '2222222222',
      role: 'employee',
      clientId: 'client_a',
      updatedAt: now,
    });

    await setDoc(doc(db, 'leads', 'client_a_lead'), {
      clientId: 'client_a',
      name: 'Client A Lead',
      phone: '7777777777',
      status: 'pending',
      source: 'Manual',
      assignedTo: 'emp1_uid',
      createdAt: now,
    });

    await setDoc(doc(db, 'leads', 'client_b_lead_assigned_to_emp1'), {
      clientId: 'client_b',
      name: 'Client B Lead',
      phone: '8888888888',
      status: 'pending',
      source: 'Manual',
      assignedTo: 'emp1_uid',
      createdAt: now,
    });

    await setDoc(doc(db, 'employeeInvites', '1111111111'), {
      name: 'Employee One',
      phone: '1111111111',
      role: 'employee',
      codeHash: 'a'.repeat(64),
      used: false,
      createdAt: now,
      createdBy: 'admin_uid',
    });
  });
}

async function run() {
  const rules = await fs.readFile(rulesPath, 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });

  const adminDb = testEnv.authenticatedContext('admin_uid', { email: 'admin@estatepulse.com' }).firestore();
  const emp1Db = testEnv.authenticatedContext('emp1_uid', { email: '1111111111@estatepulse.com' }).firestore();
  const emp2Db = testEnv.authenticatedContext('emp2_uid', { email: '2222222222@estatepulse.com' }).firestore();
  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await seedBaseData(testEnv);

  const tests = [];
  const add = (name, fn) => tests.push({ name, fn });

  add('employee can read own user doc', async () => {
    await assertSucceeds(getDoc(doc(emp1Db, 'users', 'emp1_uid')));
  });

  add('employee cannot read other user doc', async () => {
    await assertFails(getDoc(doc(emp1Db, 'users', 'emp2_uid')));
  });

  add('employee cannot list users collection', async () => {
    await assertFails(getDocs(collection(emp1Db, 'users')));
  });

  add('admin can list users collection', async () => {
    await assertSucceeds(getDocs(query(collection(adminDb, 'users'), where('clientId', '==', 'client_a'))));
  });

  add('employee can list employeeDirectory collection', async () => {
    await assertSucceeds(getDocs(query(collection(emp1Db, 'employeeDirectory'), where('clientId', '==', 'client_a'))));
  });

  add('employee can read own company assigned lead', async () => {
    await assertSucceeds(getDoc(doc(emp1Db, 'leads', 'client_a_lead')));
  });

  add('employee cannot read assigned lead from another company', async () => {
    await assertFails(getDoc(doc(emp1Db, 'leads', 'client_b_lead_assigned_to_emp1')));
  });

  add('employee can create self-assigned lead for own company', async () => {
    await assertSucceeds(
      setDoc(doc(emp1Db, 'leads', 'employee_created_lead'), {
        clientId: 'client_a',
        clientName: 'Client A',
        name: 'Employee Created Lead',
        phone: '6666666666',
        source: 'Employee Added',
        status: 'pending',
        assignedTo: 'emp1_uid',
        addedById: 'emp1_uid',
        addedByName: 'Employee One',
        addedByRole: 'employee',
        assignedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    );
  });

  add('employee cannot create self-assigned lead with executive source', async () => {
    await assertFails(
      setDoc(doc(emp1Db, 'leads', 'employee_created_lead_bad_source'), {
        clientId: 'client_a',
        clientName: 'Client A',
        name: 'Bad Source Lead',
        phone: '6666666667',
        source: 'Executive Added',
        status: 'pending',
        assignedTo: 'emp1_uid',
        addedById: 'emp1_uid',
        addedByName: 'Employee One',
        addedByRole: 'employee',
        assignedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    );
  });

  add('admin cannot read lead from another company', async () => {
    await assertFails(getDoc(doc(adminDb, 'leads', 'client_b_lead_assigned_to_emp1')));
  });

  add('employee can edit own assigned lead name and status', async () => {
    await assertSucceeds(updateDoc(doc(emp1Db, 'leads', 'client_a_lead'), {
      name: 'Updated Client A Lead',
      status: 'interested',
      updatedAt: Timestamp.now(),
    }));
  });

  add('employee cannot edit assigned lead phone', async () => {
    await assertFails(updateDoc(doc(emp1Db, 'leads', 'client_a_lead'), {
      phone: '9999999999',
      updatedAt: Timestamp.now(),
    }));
  });

  add('admin can save company branding', async () => {
    await assertSucceeds(
      setDoc(doc(adminDb, 'clientBranding', 'client_a'), {
        logoUrl: 'data:image/png;base64,abc',
        companyName: 'Client A',
        tagline: 'Trusted homes',
        updatedAt: Timestamp.now(),
        updatedBy: 'admin_uid',
      }),
    );
  });

  add('employee can read own company branding', async () => {
    await assertSucceeds(getDoc(doc(emp1Db, 'clientBranding', 'client_a')));
  });

  add('employee cannot read another company branding', async () => {
    await assertFails(getDoc(doc(emp1Db, 'clientBranding', 'client_b')));
  });

  add('employee can read own invite by mobile', async () => {
    await assertSucceeds(getDoc(doc(emp1Db, 'employeeInvites', '1111111111')));
  });

  add('employee cannot read someone else invite', async () => {
    await assertFails(getDoc(doc(emp2Db, 'employeeInvites', '1111111111')));
  });

  add('anonymous user cannot read invite', async () => {
    await assertFails(getDoc(doc(anonymousDb, 'employeeInvites', '1111111111')));
  });

  add('employee can claim invite exactly once', async () => {
    await assertSucceeds(
      setDoc(
        doc(emp1Db, 'employeeInvites', '1111111111'),
        {
          used: true,
          usedAt: Timestamp.now(),
          usedBy: 'emp1_uid',
        },
        { merge: true },
      ),
    );

    await assertFails(
      setDoc(
        doc(emp1Db, 'employeeInvites', '1111111111'),
        {
          used: true,
          usedAt: Timestamp.now(),
          usedBy: 'emp1_uid',
        },
        { merge: true },
      ),
    );
  });

  add('new employee can create own users doc with employee role', async () => {
    const newEmpDb = testEnv
      .authenticatedContext('new_emp_uid', { email: '3333333333@estatepulse.com' })
      .firestore();

    await assertSucceeds(
      setDoc(doc(newEmpDb, 'users', 'new_emp_uid'), {
        name: 'New Employee',
        email: '3333333333@estatepulse.com',
        phone: '3333333333',
        role: 'employee',
        createdAt: Timestamp.now(),
      }),
    );
  });

  add('new employee cannot self-create admin role', async () => {
    const attackerDb = testEnv
      .authenticatedContext('attacker_uid', { email: '4444444444@estatepulse.com' })
      .firestore();

    await assertFails(
      setDoc(doc(attackerDb, 'users', 'attacker_uid'), {
        name: 'Attacker',
        email: '4444444444@estatepulse.com',
        phone: '4444444444',
        role: 'admin',
        createdAt: Timestamp.now(),
      }),
    );
  });

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.fn();
      passed += 1;
      console.log(`PASS: ${test.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${test.name}`);
      console.error(error);
    }
  }

  await testEnv.cleanup();

  console.log(`\nRules test summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('Failed to run Firestore rules tests.');
  console.error(error);
  process.exit(1);
});
