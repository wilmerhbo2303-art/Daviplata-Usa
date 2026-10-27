import { createDaviApiHandler } from '../../../server/create-handler';
import router from '../../../server/routes/daviplata-breb';

export default createDaviApiHandler(router, '/api/daviplata/breb/lookup');
