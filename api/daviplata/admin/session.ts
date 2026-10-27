import { createDaviApiHandler } from '../../../server/create-handler';
import router from '../../../server/routes/daviplata-admin';

export default createDaviApiHandler(router, '/api/daviplata/admin/session');
