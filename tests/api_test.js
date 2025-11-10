const axios = require('axios');

const base = 'http://localhost:3001';

async function run() {
  try {
    const unique = Date.now();
    const email = `test+${unique}@example.com`;
    const password = 'TestPass123!';

    console.log('1) Register');
    const reg = await axios.post(`${base}/register`, { email, password });
    console.log(' register response status', reg.status);
    const user = reg.data.result;
    console.log(' created user _id:', user._id, 'luser:', user.user_id);

    console.log('2) Login');
    const login = await axios.post(`${base}/login`, { email, password });
    console.log(' login status', login.status);
    const token = login.data.token;
    if (!token) throw new Error('No token returned from login');

    const auth = { headers: { Authorization: `Bearer ${token}` } };

    console.log('3) Create Profile (protected)');
    const profBody = {
      user: user._id,
      password: 'profile-pass',
      firstName: 'Alice',
      lastName: 'Tester',
      title: 'Engineer',
      email,
      phone: '555-1234',
      is_available: true,
    };
    const profCreate = await axios.post(`${base}/profiles`, profBody, auth);
    console.log(' profile created status', profCreate.status, 'id:', profCreate.data._id || profCreate.data.user);

    console.log('4) Get Profile by _id (public)');
    const profGet = await axios.get(`${base}/profiles/${user._id}`);
    console.log(' profile get status', profGet.status, 'email:', profGet.data.email, 'image:', profGet.data.profile_image_url);

    console.log('5) Get Profile by luser (public)');
    const profGet2 = await axios.get(`${base}/profiles/by-userid/${user.user_id}`);
    console.log(' profile by luser status', profGet2.status, 'firstName:', profGet2.data.firstName);

    console.log('6) Create Org (protected)');
    const orgBody = {
      name: 'Test Org ' + unique,
      phone: '555-0000',
      address: '123 Test St',
      city: 'Testville',
      state: 'TS',
      zipcode: '12345',
      is_open: true,
      donations_needed: 100,
    };
    const orgCreate = await axios.post(`${base}/orgs`, orgBody, auth);
    console.log(' org created status', orgCreate.status);
    const org = orgCreate.data;
    console.log(' org _id:', org._id, 'org_id:', org.org_id);

    console.log('7) List Orgs (public)');
    const orgs = await axios.get(`${base}/orgs`);
    console.log(' orgs count', orgs.data.length);

    console.log('8) Get Org by id (public)');
    const orgGet = await axios.get(`${base}/orgs/${org._id}`);
    console.log(' org get status', orgGet.status, 'name:', orgGet.data.name, 'image:', orgGet.data.org_image_url);

    console.log('9) Patch Org (protected)');
    const patch = await axios.patch(`${base}/orgs/${org._id}`, { donations_acquired: 10 }, auth);
    console.log(' org patch status', patch.status, 'donations_acquired:', patch.data.donations_acquired);

    console.log('10) Patch Profile (protected)');
    const patchProf = await axios.patch(`${base}/profiles/${user._id}`, { title: 'Senior Engineer' }, auth);
    console.log(' profile patch status', patchProf.status, 'title:', patchProf.data.title);

    console.log('11) Delete Org (protected)');
    const delOrg = await axios.delete(`${base}/orgs/${org._id}`, auth);
    console.log(' org delete status', delOrg.status, delOrg.data);

    console.log('12) Delete Profile (protected)');
    const delProf = await axios.delete(`${base}/profiles/${user._id}`, auth);
    console.log(' profile delete status', delProf.status, delProf.data);

    console.log('All requests completed successfully');
  } catch (err) {
    if (err.response) {
      console.error('Request failed:', err.response.status, err.response.data);
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  }
}

run();
