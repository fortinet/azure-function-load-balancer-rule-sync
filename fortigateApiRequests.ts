import axios from 'axios';
import https from 'https';

export class FortiGateAPIRequests {
    private path: string;
    private FORTIGATE_IP: string;
    private API_KEY: string;
    private rejectCerts: boolean;
    constructor(path: string, FORTIGATE_IP: string, API_KEY: string, rejectCerts: boolean) {
        this.path = path;
        this.FORTIGATE_IP = FORTIGATE_IP;
        this.API_KEY = API_KEY;
        this.rejectCerts = rejectCerts;
    }
    public async httpsGetRequest() {
        var url = 'https://' + this.FORTIGATE_IP + this.path;
        const agent = new https.Agent({
            rejectUnauthorized: this.rejectCerts
        });
        var options = {
            httpsAgent: agent,
            headers: {
                Authorization: 'Bearer ' + this.API_KEY
            }
        };
        try {
            const response = await axios.get(url, options);
            return response.data;
        } catch (err) {
            console.log(err);
        }
        throw console.error(`Error retrieving VIP data from Fortigate: ${url} `);
    }
}
