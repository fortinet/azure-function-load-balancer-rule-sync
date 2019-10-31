
import * as msRest from '@azure/ms-rest-js';
import * as Models from '@azure/arm-network/src/models';
import * as msRestAzure from '@azure/ms-rest-azure-js';
import * as msRestNodeAuth from '@azure/ms-rest-nodeauth';
import { NetworkManagementClient, NetworkManagementModels, NetworkManagementMappers, LoadBalancerProbes } from '@azure/arm-network';
import https from 'https';

// Script to update the Ports on an Azure LoadBalancer based on Rules in the FortiGate
// Creates SLB rules on a triggered event in the FortiGate

// TODO: ? Error: Error: Another operation on this or dependent resource is in progress.

// tslint:disable-next-line: max-line-length
// TODO: fail on backend pool not existing: At least one backend pool and one probe must exist before you can create a rule. You can create a backend pool at Settings > Backend pools, and you can create a probe at Settings > Probes, or by clicking here.

const
    SCAN_INTERVAL = process.env.SCAN_INTERVAL,
    REST_APP_ID = process.env.REST_APP_ID,
    REST_APP_SECRET = process.env.REST_APP_SECRET,
    SUBSCRIPTION_ID = process.env.SUBSCRIPTION_ID,
    TENANT_ID = process.env.TENANT_ID,
    RESOURCE_GROUP_NAME = process.env.RESOURCE_GROUP_NAME,
    LOADBALANCER_NAME = process.env.LOADBALANCER_NAME,
    FORTIGATE_IP = process.env.FORTIGATE_IP,
    API_KEY = process.env.API_KEY,
    PERSISTENCE = process.env.PERSISTENCE,
    LOCATION = process.env.LOCATION,
    FRONTEND_IP_NAME = process.env.FRONTEND_IP_NAME,
    BACKEND_POOL_NAME = process.env.BACKEND_POOL_NAME,
    PROBE_NAME = process.env.PROBE_NAME,
    CONSTRUCTED_FRONTEND_URL = `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP_NAME}/providers/Microsoft.Network/loadBalancers/${LOADBALANCER_NAME}/frontendIPConfigurations/${FRONTEND_IP_NAME}`,
    CONSTRUCTED_BACKEND_URL = `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP_NAME}/providers/Microsoft.Network/loadBalancers/${LOADBALANCER_NAME}/backendAddressPools/${BACKEND_POOL_NAME}`,
    CONSTRUCTED_PROBE_URL = `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP_NAME}/providers/Microsoft.Network/loadBalancers/${LOADBALANCER_NAME}/probes/${PROBE_NAME}`;

const token = process.env.TOKEN;
const credentials = new msRest.TokenCredentials(token);
const client = new NetworkManagementClient(credentials, SUBSCRIPTION_ID);

exports.main = async function(context, req) {

        console.log('JavaScript HTTP trigger function processed a request.');
        var addELBPort = new AddLoadBalancerPort();
        var elbPorts = await addELBPort.getLoadBalancerPorts();
        console.log('************************ELBPORTS*************************' + JSON.stringify(elbPorts));
        // var getELB = await addELBPort.getLoadBalancer();
        var getPorts: any = await addELBPort.getFortiGateVIPs();
        // console.log("ports" + getPorts);
        addELBPort.addPortToExternalLoadBalancer();

        if (req && req.body && req.body.data && req.body.data.rawlog && req.body.data.rawog.srcip) {
        try {
            var src_ip = req.body.data.rawlog.srcip;
            var addELBPort = new AddLoadBalancerPort();
            addELBPort.getLoadBalancerPorts();
        } catch (err) {
            context.log(`Error Retrieving the Source IP ${err}`);
        }
    }

};
// Probably better to Get Full JSON then get ports etc as needed.

class AddLoadBalancerPort {
    private loadBalancerJSON: NetworkManagementModels.LoadBalancersGetResponse;

    public async getLoadBalancerPorts() {
        const getELB = await this.getLoadBalancer();
        var getPorts = getELB.inboundNatRules;
        return getPorts;
    }
    public getFrontEndPorts(natRules) {
        var frontEndPorts = natRules.frontendPort;
        return frontEndPorts;
    }
    public getBackendPorts(natRules) {
        var backEndPorts = natRules.backendPort;
        return backEndPorts;
    }
    public async getfrontendIPConfigurations() {
        const getfrontEnd  = await this.getLoadBalancer();
        var getfrontEndConfigurations = getfrontEnd.frontendIPConfigurations;
        return getfrontEndConfigurations;
    }

    public async getLoadBalancer() {
        if (!this.loadBalancerJSON) {
            console.log('Fetching LoadBalancer Data for : ' + LOADBALANCER_NAME +
            'in resource group: ' + RESOURCE_GROUP_NAME + 'from Azure');
            try {
                const getELB = await client.loadBalancers.get(RESOURCE_GROUP_NAME, LOADBALANCER_NAME);
                this.loadBalancerJSON = getELB;
                return getELB;
            } catch (err) {
                throw console.error('Error in getting Load Balancer Data from Azure: ' + err);
            }
        } else {
            const getELB = this.loadBalancerJSON;
            return getELB;
        }
    }
    public getFortiGateVIPs() {
        let getPorts = new FortiGateAPIRequests('/api/v2/cmdb/firewall/vip');
        console.log('Fetching VIP data from Frotigate: ' + FORTIGATE_IP);
        return getPorts.httpsGetRequest();
    }

    public getMappedProtocol(fortigateProtocol): Models.TransportProtocol {
        if (fortigateProtocol === 'tcp') {
            return 'Tcp';
        } else if (fortigateProtocol === 'udp') {
            return 'Udp';
        } else if (fortigateProtocol === 'sctp') {
            console.log('SCTP is not supported in Azure Load Balancers. Pick UDP or TCP in the VIP '
             + fortigateProtocol + ' returning null');
            return null;
        } else if (fortigateProtocol === 'icmp') {
            console.log('ICMP is not supported in Azure Load Balancers. Pick UDP or TCP in the VIP '
            + fortigateProtocol + ' returning null');
            return null;
        } else {
            console.log('Unkown protocol found '
            + fortigateProtocol + ' returning null');
            return null;
        }
    }
    // Get Persistence type Must be one of: "Default" | "SourceIP" | "SourceIPProtocol"
    public getMappedloadDistribution(): Models.LoadDistribution {
        if (PERSISTENCE.toLowerCase() === 'default') {
            return 'Default';
        } else if (PERSISTENCE.toLowerCase() ===  'sourceip') {
            return 'SourceIP';
        } else if (PERSISTENCE.toLowerCase() === 'sourceipprotocol') {
            return 'SourceIPProtocol';
        } else {
            throw console.error('No protocol could be maped using the current values:'
            + PERSISTENCE + ' Values must be one of the following Default" | "SourceIP" | "SourceIPProtoco');
        }

}
// Get the Public IP tied to the front End Config. Required to Update loadbalancer rules.
    public async getFrontEndPublicIP() {
        const getELB  = await this.getLoadBalancer();
        if (getELB && getELB.frontendIPConfigurations) {
        for (let item of getELB.frontendIPConfigurations) {
            if (item.name === FRONTEND_IP_NAME) {
                console.log('Public IP: ' + item.name, item.publicIPAddress.id);
                return item.publicIPAddress.id;
            } else {
                throw console.error('Error in getFrontEndPublicIP. No FontEnd Config found with the name '
                 + FRONTEND_IP_NAME);
            }
        }
    } else {
        throw console.error('Error in getFrontEndPublicIP. JSON data could not be retrieved.');

    }
    // Throw an error here or else typescript will complain
        throw console.error('Error in getFrontEndPublicIP. JSON data could not be retrieved.');
    }
// Returns a list of resource ID's attached to the backendAddress Pool. Required to update LoadBalancing rules.
    public async getbackendIPConfigurationList() {
        const getELB  = await this.getLoadBalancer();
        if (getELB && getELB.backendAddressPools) {
        for (let item of getELB.backendAddressPools) {
            if (item.name === BACKEND_POOL_NAME) {
                console.log('Backend Pool Name: ' + item.name, item.backendIPConfigurations);
                return item.backendIPConfigurations;
            } else {
                throw console.error('Error in getFrontEndPublicIP. No FontEnd Config found with the name ' + FRONTEND_IP_NAME);
            }
        }
    } else {
        throw console.error('Error in getFrontEndPublicIP. JSON data could not be retrieved.');

    }
    // Throw an error here or else typescript will complain
        throw console.error('Error in getFrontEndPublicIP. JSON data could not be retrieved.');
    }

// Get the Port tied to the probe. Required to Create/Update loadbalancer rules.
    public async getProbePort() {
        const getELB  = await this.getLoadBalancer();

        if (getELB && getELB.probes) {
        for (let item of getELB.probes) {
            if (item.name === PROBE_NAME) {
                console.log('Probe: ' + item.name, item.port);
                return item.port;
            } else {
                throw console.error('Error in getProbePort. No probe found with the name ' + PROBE_NAME);
            }
        }
    } else {
        throw console.error('Error in getProbePort. Probes data could not be retrieved.');

    }
    // Throw an error here or else typescript will complain
        throw console.error('Error in getProbePort. Probes data could not be retrieved.');

    }

    public range(size: number, startAt: number): ReadonlyArray<number> {
        return [...Array(size).keys()].map((i) => i + startAt);
    }

    public splitURL(indexItem) {
        var lastindex = indexItem.lastIndexOf('/');
        var result = indexItem.substring(lastindex + 1);
        return result;
    }

    public async buildLoadBalancerParameters() {
        console.log(PERSISTENCE);
        var parameters;
        var item: any;
        try {
            var vipStringList: any  =  await this.getFortiGateVIPs();
            var vipJSONList = JSON.parse(vipStringList);
        } catch (err) {
            console.log(`Error fetching JSON List in buildLoadBalancerParameters : ${err}`);
            throw err;
        }
        // Add parameters here to Loadbalancing rules push to addPortToExternalLoadBalancer as a list and add all at once.
        var loadBalancingRules = [];
        var portsAddedTCP = [];
        var portsAddedUDP = [];
        if (vipJSONList && vipJSONList.results) {
            var persistence = this.getMappedloadDistribution();
            for (let vipList of vipJSONList.results) {
                if (parseInt(vipList.extport, 10) === 0 || parseInt(vipList.mappedport, 10) === 0) {
                    console.log('External and Backend Ports of 0 are not supported. (Make sure PortForwarding is enabled). Skipping Rule: ' + vipList.name);
                } else if (vipList.extport.includes('-')) {
                    var splitPortRange = vipList.extport.split('-');
                    let getRange = this.range( parseInt(splitPortRange[1]) - parseInt(splitPortRange[0]) + 1, parseInt(splitPortRange[0]));
                    console.log('range ' + getRange);
                    console.log(splitPortRange);

                    for (var port in getRange) {
                        var mappedProtocol = this.getMappedProtocol(vipList.protocol);
                        //
                        // Check for overlapping ports.If no check is done the entire update request will be dropped.
                        // Overlapping ports with different protocols are supported.(UDP/TCP)
                        // Each port is added to a respective list. portsAddedTCP or portsAddedUDP
                        // This reducces the complexity of iterating over an ever increasing list of objects.
                        //
                        if (mappedProtocol === 'Tcp' && portsAddedTCP.includes(getRange[port])) {
                            console.log('Overlapping Port Ranges not supported. Dropping: ' + vipList.name
                             + mappedProtocol);
                            break;
                        } else if (mappedProtocol === 'Udp' && portsAddedUDP.includes(getRange[port])) {
                            console.log('Overlapping Port Ranges not supported. Dropping: ' + vipList.name
                             + mappedProtocol);
                            break;
                        } else if (mappedProtocol === null) {
                            console.log('Unsupported Protocol Dropping VIP rule: ' + vipList.name + ' '
                            + mappedProtocol);
                            break;
                        } else {

                                parameters = {
                                    protocol : mappedProtocol,
                                    loadDistribution : persistence,
                                    frontendIPConfiguration : {
                                        id: CONSTRUCTED_FRONTEND_URL,
                                    },
                                    backendAddressPool:
                                    { id: CONSTRUCTED_BACKEND_URL,
                                    },
                                    probe:
                                    { id: CONSTRUCTED_PROBE_URL,
                                    },
                                    frontendPort : getRange[port],
                                    backendPort : getRange[port],
                                    name: vipList.name + '-' + port,
                                };

                                if (mappedProtocol === 'Tcp') {
                                     portsAddedTCP.push(getRange[port]);
                                } else {(mappedProtocol === 'Udp'); } {
                                    portsAddedUDP.push(getRange[port]);

                        }

                                loadBalancingRules.push(parameters);
                            }
                            }

                } else {
                    var mappedProtocol = this.getMappedProtocol(vipList.protocol);
                    if (mappedProtocol === 'Tcp' && portsAddedTCP.includes(parseInt(vipList.extport, 10))) {
                        console.log('Overlapping Port Ranges not supported. Dropping: ' + vipList.name + ' '
                            + mappedProtocol);
                        break;
                    } else if (mappedProtocol === 'Udp' && portsAddedUDP.includes(parseInt(vipList.extport, 10))) {
                        console.log('Overlapping Port Ranges not supported. Dropping: ' + vipList.name + ' '
                            + mappedProtocol);
                        break;
                    } else if (mappedProtocol === null) {
                        console.log('Unsupported Protocol Dropping VIP rule: ' + vipList.name + ' '
                        + mappedProtocol);
                        break;
                    } else {
                    parameters = {
                        protocol : mappedProtocol,
                        loadDistribution : persistence,
                        frontendIPConfiguration : {
                            id: CONSTRUCTED_FRONTEND_URL,
                        },
                        backendAddressPool:
                        { id: CONSTRUCTED_BACKEND_URL,
                        },
                        probe:
                        { id: CONSTRUCTED_PROBE_URL,
                        },
                        frontendPort : parseInt(vipList.extport, 10),
                        backendPort : parseInt(vipList.mappedport, 10),
                        name: vipList.name,
                    };
                    loadBalancingRules.push(parameters);

                    if (mappedProtocol === 'Tcp') {
                        portsAddedTCP.push(parseInt(vipList.extport, 10));
                   } else {(mappedProtocol === 'Udp'); } {
                       portsAddedUDP.push(parseInt(vipList.extport, 10));
                   }
           }
                }
            }
            return loadBalancingRules;

        }
        throw console.error('Error in buildLoadBalancerParameters. Data from fortigate Not present');
    }
    public async addPortToExternalLoadBalancer() {
        var probePort = await this.getProbePort();
        var publicIP = await this.getFrontEndPublicIP();
        var backendIPconfig = await this.getbackendIPConfigurationList();
        var getloadBalancingRules: any = await this.buildLoadBalancerParameters();
        var parameters: any = {
            location: LOCATION,
            frontendIPConfigurations: [{
               id: CONSTRUCTED_FRONTEND_URL,
                publicIPAddress: {
                    id: publicIP,
                },
                name: FRONTEND_IP_NAME,

            },

            ],
            backendAddressPools: [{
                id:  CONSTRUCTED_BACKEND_URL,
                backendIPConfigurations: [{
                    id: backendIPconfig,
                }],
                name: BACKEND_POOL_NAME,

            }],
            probes: [{
                id: CONSTRUCTED_PROBE_URL,
                port: probePort,
                name: PROBE_NAME,
            }],
            loadBalancingRules: getloadBalancingRules,
        };
        console.log('****************************************************************************');
        console.log(parameters);
        try {
        let addPort = await client.loadBalancers.createOrUpdate(RESOURCE_GROUP_NAME, LOADBALANCER_NAME, parameters);
        } catch (err) {
            console.log(`Error: ${err}`);
            throw err;
        }

    }
}

// TODO: Update error messages.
class FortiGateAPIRequests {
    private path: string;
    constructor(path: string) {
        this.path = path;
    }

    public httpsGetRequest() {
        return new Promise((resolve, reject) => {
            var url = 'https://' + FORTIGATE_IP + this.path ;
            // RejectUnathorized set to false for self-signed certs.
            var options = {
                rejectUnauthorized : false,
                headers: {
                    Authorization : 'Bearer ' + API_KEY,
                  },
            };
            https.get(url, options, async function(res) {
                     var body = '';
                     console.log('Fortigate StatusCode: ' + res.statusCode);
                     res.on('data', function(chunk) {
                        body = body + chunk;
                     });
                     res.on('end', function() {
                        resolve(body);
                    });
                   }).on('error', function(e) {
                     console.log('Error retreiving data from Fortigate: ' + e.message);
                   });

                });

    }
}
if (module === require.main) {
    exports.main(console.log);
}
