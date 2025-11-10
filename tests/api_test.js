const axios = require('axios');
const assert = require('assert');

const base = process.env.TEST_ENDPOINT || 'http://localhost:3000/';

async function run() {
  console.log('Running API test against', base);
  const email = `test+${Date.now()}@example.com`;
  const password = 'TestPass123!';

  // register
  const reg = await axios.post(base + 'register', { email, password }).catch(e => { throw e; });
  assert(reg.data && reg.data.token, 'register did not return token');
  console.log('Registered user, token present');

  // login
  const login = await axios.post(base + 'login', { email, password }).catch(e => { throw e; });
  assert(login.data && login.data.token, 'login did not return token');
  const token = login.data.token;
  console.log('Login ok');

  // create org
  const payload = {
    name: 'Test Org ' + Date.now(),
    specialty_codes: [1,4],
    phone: '555-999-0000',
    address: '100 Test St',
    city: 'Testville',
    state: 'TS',
    zipcode: '00000',
    donations_needed: 1000,
    donations_acquired: 200,
  };

  const create = await axios.post(base + 'orgs', payload, { headers: { Authorization: `Bearer ${token}` } }).catch(e => { throw e; });
  assert(create.status === 201, 'create org did not return 201');
  const org = create.data;
  console.log('Created org id', org._id || org.org_id);
  assert(Array.isArray(org.specialty_codes), 'org.specialty_codes missing');
  assert(org.specialty_codes.includes(1) && org.specialty_codes.includes(4), 'specialty codes not retained');

  // fetch org
  const fetch = await axios.get(base + `orgs/${org._id || org.org_id}`).catch(e => { throw e; });
  const f = fetch.data;
  assert(Array.isArray(f.specialty_codes), 'fetched org missing specialty_codes');
  console.log('Fetched org specialty_codes ok', f.specialty_codes);

  console.log('API test passed');
}

run().catch(err => {
  console.error('API test failed', err.response?.data || err.message);
  process.exit(1);
});
