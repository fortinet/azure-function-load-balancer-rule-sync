
// import * as NetworkManagementClient from "@azure/arm-network"
import * as msRest from '@azure/ms-rest-js';
import * as Models from  '@azure/arm-network/src/models';
import * as msRestAzure from '@azure/ms-rest-azure-js';
import * as msRestNodeAuth from '@azure/ms-rest-nodeauth';
import { NetworkManagementClient, NetworkManagementModels, NetworkManagementMappers } from '@azure/arm-network';
import { LoadBalancer } from '@azure/arm-network/esm/models/mappers';
import https from 'https';
import { resolve } from 'path';
// Script to update the Ports on an Azure LoadBalancer based on Rules in the FortiGate
// Scans the FortiGate and SLB every 5 minutes to ensure that rules match.
// Creates SLB rules on a triggered event in the FortiGate

// TODO: fail on backend pool not existing: At least one backend pool and one probe must exist before you can create a rule. You can create a backend pool at Settings > Backend pools, and you can create a probe at Settings > Probes, or by clicking here.
// TODO: Delete ports no longer on fortigate
// FIX : Manually Creating a rule on the SLB will cause an error to occur in the script on CreateorUpdate
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
    PROBE_NAME = process.env.PROBE_NAME;

const token = process.env.TOKEN;
const credentials = new msRest.TokenCredentials(token);
const client = new NetworkManagementClient(credentials, SUBSCRIPTION_ID);
const msRestClient = msRest;

exports.main = async function(context, req) {

        console.log('JavaScript HTTP trigger function processed a request.');
        var addELBPort = new AddLoadBalancerPort();
        addELBPort.getLoadBalancerPorts();
        var getELB = await addELBPort.getLoadBalancer();
        var getPorts: any = await addELBPort.getFortiGateVIPs();
        console.log("ports" + getPorts);
        addELBPort.addPortToExternalLoadBalancer();
        addELBPort.buildLoadBalancerParameters();

        // console.log(getPorts.toString());
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
    public async getLoadBalancerPorts() {
        const getELB = await this.getLoadBalancer();
        var getPorts = getELB.inboundNatRules;
        return getPorts;
    }
    public async getFrontEndPorts(natRules) {
        var frontEndPorts = natRules.frontendPort;
        return frontEndPorts;
    }
    public async getBackendPorts(natRules) {
        var backEndPorts = natRules.backendPort;
        return backEndPorts;
    }
    public async updateLoadBalancer() {

    }
    public async scanLoadBalancer() {

    }
    public async scanFortiGatePorts() {

    }
    public async getLoadBalancer() {
        const getELB = await client.loadBalancers.get(RESOURCE_GROUP_NAME, LOADBALANCER_NAME);
        return getELB;
    }
    public getFortiGateVIPs() {
        let getPorts = new FortiGateAPIRequests('/api/v2/cmdb/firewall/vip');
        return getPorts.httpsGetRequest();
    }

    public getMappedProtocol(fortigateProtocol): Models.TransportProtocol {
        if (fortigateProtocol === 'tcp') {
            return 'Tcp';
        } else if (fortigateProtocol === 'udp') {
            return 'Udp';
        } else if (fortigateProtocol === 'sctp') {
            throw console.error('SCTP is not supported in Azure Load Balancers. Pick UDP or TCP in the VIP'
             + fortigateProtocol);
        } else if (fortigateProtocol === 'icmp') {
            return 'Tcp';
        } else {
            throw console.error('No protocol could be maped using the current values:' + fortigateProtocol);
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
//
    public getMappedPorts(portRange){
        if (portRange.includes('-')) {

        }
    }
    public range(size:number, startAt:number):ReadonlyArray<number> {
        return [...Array(size).keys()].map(i => i + startAt);
    }

    public async buildLoadBalancerParameters() {
        console.log(PERSISTENCE);
        var parameters;
        try {
            var vipStringList: any  =  await this.getFortiGateVIPs();
            var vipJSONList = JSON.parse(vipStringList);
        } catch (err) {
            console.log(`Error fetching JSON List in buildLoadBalancerParameters : ${err}`);
            throw err;
        }
        // Add parameters here to Loadbalancing rules push to addPortToExternalLoadBalancer as a list and add all at once.
        var loadBalancingRules = [];
        if (vipJSONList && vipJSONList.results) {
            var persistence = this.getMappedloadDistribution();
            for (let vipList of vipJSONList.results) {
                if (parseInt(vipList.extport, 10)=== 0 || parseInt(vipList.mappedport, 10)===0){
                    console.log("External and Backend Ports of 0 are not supported. Skipping Rule: " + vipList.name);

                }
                else if (vipList.extport.includes('-')) {
                    var splitPortRange = vipList.extport.split('-');
                    let getRange = this.range( parseInt(splitPortRange[1])- parseInt(splitPortRange[0])+1, parseInt(splitPortRange[0]));
                    console.log("range " + getRange);
                    console.log(splitPortRange);

                    for (var port in getRange){
                        var mappedProtocol = this.getMappedProtocol(vipList.protocol);
                        parameters = {
                            protocol : mappedProtocol,
                            loadDistribution : persistence,
                            frontendIPConfiguration : {
                                id: `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP_NAME}/providers/Microsoft.Network/loadBalancers/${LOADBALANCER_NAME}/frontendIPConfigurations/${FRONTEND_IP_NAME}`,
                            },
                            backendAddressPool:
                            { id: `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP_NAME}/providers/Microsoft.Network/loadBalancers/${LOADBALANCER_NAME}/backendAddressPools/${BACKEND_POOL_NAME}`,
                            },
                            probe:
                            { id: `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP_NAME}/providers/Microsoft.Network/loadBalancers/${LOADBALANCER_NAME}/probes/${PROBE_NAME}`,
                            },
                            frontendPort : getRange[port],
                            backendPort : getRange[port],
                            name: vipList.name + "-" + port,
                        };
                        loadBalancingRules.push(parameters);
                    }
                    // for(var int in splitPortRange){
                    // }
                }else {
                    var mappedProtocol = this.getMappedProtocol(vipList.protocol);
                    parameters = {
                        protocol : mappedProtocol,
                        loadDistribution : persistence,
                        frontendIPConfiguration : {
                            id: `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP_NAME}/providers/Microsoft.Network/loadBalancers/${LOADBALANCER_NAME}/frontendIPConfigurations/${FRONTEND_IP_NAME}`,
                        },
                        backendAddressPool:
                        { id: `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP_NAME}/providers/Microsoft.Network/loadBalancers/${LOADBALANCER_NAME}/backendAddressPools/${BACKEND_POOL_NAME}`,
                        },
                        probe:
                        { id: `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP_NAME}/providers/Microsoft.Network/loadBalancers/${LOADBALANCER_NAME}/probes/${PROBE_NAME}`,
                        },
                        frontendPort : parseInt(vipList.extport, 10),
                        backendPort : parseInt(vipList.mappedport, 10),
                        name: vipList.name,
                    };
                    loadBalancingRules.push(parameters);
                }
            }
            //  for (var i in loadBalancingRules) {
            //      console.log('****************************************************************************');
            //      console.log(loadBalancingRules[i]);}
            return loadBalancingRules;

        }
        return -1;
    }
    public async addPortToExternalLoadBalancer() {
        var protocol: Models.TransportProtocol = 'Tcp';
        var loadDistribution: Models.LoadDistribution = 'SourceIPProtocol';
        var getloadBalancingRules : any = await this.buildLoadBalancerParameters();
        var parameters = {
            location: LOCATION,
            loadBalancingRules:getloadBalancingRules,
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
    // TODO: does this make sense? What if I have multple  GET/POST/PUT will the request stay the same?
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
                     console.log('StatusCode: ' + res.statusCode);
                     res.on('data', function(chunk) {
                        body = body + chunk;
                     });
                     res.on('end', function() {
                        resolve(body);
                    });
                   }).on('error', function(e) {
                     console.log('Got error: ' + e.message);
                   });

                });

    }
}
if (module === require.main) {
    exports.main(console.log);
}
