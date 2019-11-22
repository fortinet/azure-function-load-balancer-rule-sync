//
// Script to update the Ports on an external Azure LoadBalancer based on VIP Rules in the FortiGate
// Creates SLB rules on a triggered event in the FortiGate.
// Once tiggered the script will scan the VIPs on the fortigate and upload an edited list
// via the Azure API.
// Supports UDP/TCP rules. Will drop SCTP or ICMP from the fortigate.
//
import * as msRest from '@azure/ms-rest-js';
import { FortiGateAPIRequests } from './fortigateApiRequests';
import * as Models from '@azure/arm-network/src/models';
import * as msRestNodeAuth from '@azure/ms-rest-nodeauth';
import {
    NetworkManagementClient,
    NetworkManagementModels,
} from '@azure/arm-network';

const {
    REST_APP_ID,
    REST_APP_SECRET,
    SUBSCRIPTION_ID,
    TENANT_ID,
    RESOURCE_GROUP_NAME,
    LOADBALANCER_NAME,
    FORTIGATE_IP,
    API_KEY,
    LOCATION,
    FRONTEND_IP_NAME,
    BACKEND_POOL_NAME,
    PROBE_NAME,
} = process.env,

    PERSISTENCE = process.env.PERSISTENCE || 'default',
    SHOW_PARAMETERS_IN_LOG = process.env.SHOW_PARAMETERS_IN_LOG || false,
    RUN_ALWAYS = process.env.RUN_ALWAYS || false,
    REJECT_UNAUTHORIZED_CERTS = process.env.REJECT_UNAUTHORIZED_CERTS || false,
    CONSTRUCTED_FRONTEND_URL = `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP_NAME}/providers/Microsoft.Network/loadBalancers/${LOADBALANCER_NAME}/frontendIPConfigurations/${FRONTEND_IP_NAME}`,
    CONSTRUCTED_BACKEND_URL = `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP_NAME}/providers/Microsoft.Network/loadBalancers/${LOADBALANCER_NAME}/backendAddressPools/${BACKEND_POOL_NAME}`,
    CONSTRUCTED_PROBE_URL = `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP_NAME}/providers/Microsoft.Network/loadBalancers/${LOADBALANCER_NAME}/probes/${PROBE_NAME}`;


var credentials: msRest.ServiceClientCredentials | msRestNodeAuth.ApplicationTokenCredentials;
var client: NetworkManagementClient;


exports.main = async function (context, req) {
    console.log('JavaScript HTTP trigger function processed a request.');
    console.log(`SHOW_PARAMETERS_IN_LOG: ${SHOW_PARAMETERS_IN_LOG}`);
    if (
        REST_APP_ID &&
        REST_APP_SECRET &&
        SUBSCRIPTION_ID &&
        TENANT_ID &&
        RESOURCE_GROUP_NAME &&
        LOADBALANCER_NAME &&
        FORTIGATE_IP &&
        API_KEY &&
        LOCATION &&
        FRONTEND_IP_NAME &&
        BACKEND_POOL_NAME &&
        PROBE_NAME
    ) {
        if (
            req &&
            req.body &&
            req.body.data &&
            req.body.data.rawlog &&
            req.body.data.rawlog.cfgpath &&
            req.body.data.rawlog.cfgpath === 'firewall.vip'
        ) {
            try {

                console.log('VIP change triggered. Starting script');
                credentials = <msRest.ServiceClientCredentials><any>
                    await msRestNodeAuth.loginWithServicePrincipalSecret(
                        REST_APP_ID,
                        REST_APP_SECRET,
                        TENANT_ID,
                    );
                client = new NetworkManagementClient(credentials, SUBSCRIPTION_ID)
                var addELBPort = new AddLoadBalancerPort();
                var elbPorts = await addELBPort.getLoadBalancerPorts();
                await addELBPort.addPortToExternalLoadBalancer();
            } catch (err) {
                context.log(`Error Retrieving the Source IP ${err}`);
            }
        } else if (RUN_ALWAYS) {
            console.log('Always run triggered - will run any time function is triggered.');
            credentials = <msRest.ServiceClientCredentials><any>
                await msRestNodeAuth.loginWithServicePrincipalSecret(
                    REST_APP_ID,
                    REST_APP_SECRET,
                    TENANT_ID,
                );
            client = new NetworkManagementClient(credentials, SUBSCRIPTION_ID)
            var addELBPort = new AddLoadBalancerPort();
            var elbPorts = await addELBPort.getLoadBalancerPorts();
            await addELBPort.addPortToExternalLoadBalancer();
        } else {
            console.log(
                'Could not determine req.body.data.rawlog.cfgpath in call and RUN_ALAWYS is set to false.' +
                'Function Aborting.',
            );
            console.log(RUN_ALWAYS);
        }
    } else {
        console.log(
            `The following Environment Variables must not be empty or null:
                      REST_APP_ID:         ${REST_APP_ID}
                      SUBSCRIPTION_ID:     ${SUBSCRIPTION_ID}
                      TENANT_ID:           ${TENANT_ID},
                      RESOURCE_GROUP_NAME: ${RESOURCE_GROUP_NAME}
                      LOADBALANCER_NAME:   ${LOADBALANCER_NAME}
                      FORTIGATE_IP:        ${FORTIGATE_IP}
                      LOCATION:            ${LOCATION}
                      FRONTEND_IP_NAME:    ${FRONTEND_IP_NAME}
                      BACKEND_POOL_NAME:   ${PROBE_NAME}
                `);
        if (!API_KEY) {
            console.log('API_KEY: undefined');
        }
        if (!REST_APP_SECRET) {
            console.log('REST_APP_SECRET: undefined');
        }
    }
};

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
        const getfrontEnd = await this.getLoadBalancer();
        var getfrontEndConfigurations = getfrontEnd.frontendIPConfigurations;
        return getfrontEndConfigurations;
    }

    public async getLoadBalancer() {
        if (!this.loadBalancerJSON) {
            console.log(
                `Fetching LoadBalancer Data for :
                ${LOADBALANCER_NAME} in resource group: ${RESOURCE_GROUP_NAME} from Azure`,
            );
            try {
                const getELB = await client.loadBalancers.get(
                    RESOURCE_GROUP_NAME,
                    LOADBALANCER_NAME,
                );
                this.loadBalancerJSON = getELB;
                return getELB;
            } catch (err) {
                throw console.error(`Error in getting Load Balancer Data from Azure: + ${err}`);
            }
        } else {
            const getELB = this.loadBalancerJSON;
            return getELB;
        }
    }
    public getFortiGateVIPs() {
        var rejectCerts;
        if (REJECT_UNAUTHORIZED_CERTS && REJECT_UNAUTHORIZED_CERTS.toLowerCase() !== 'false') {
            rejectCerts = true;
        }
        let getPorts = new FortiGateAPIRequests('/api/v2/cmdb/firewall/vip', FORTIGATE_IP, API_KEY, rejectCerts);
        console.log(`Fetching VIP data from Frotigate: ${FORTIGATE_IP}`);
        return getPorts.httpsGetRequest();
    }

    public getMappedProtocol(fortigateProtocol): Models.TransportProtocol {
        if (fortigateProtocol === 'tcp') {
            return 'Tcp';
        } else if (fortigateProtocol === 'udp') {
            return 'Udp';
        } else if (fortigateProtocol === 'sctp') {
            console.log(
                `'SCTP is not supported in Azure Load Balancers. Pick UDP or TCP in the VIP
                ${fortigateProtocol}
                returning null`,
            );
            return null;
        } else if (fortigateProtocol === 'icmp') {
            console.log(
                ` ICMP is not supported in Azure Load Balancers. Pick UDP or TCP in the VIP
                ${fortigateProtocol} returning null`,
            );
            return null;
        } else {
            console.log(`Unkown protocol found ${fortigateProtocol} returning null`);
            return null;
        }
    }
    // Get Persistence type Must be one of: "Default" | "SourceIP" | "SourceIPProtocol"
    public getMappedloadDistribution(): Models.LoadDistribution {
        if (PERSISTENCE.toLowerCase() === 'default') {
            return 'Default';
        } else if (PERSISTENCE.toLowerCase() === 'sourceip') {
            return 'SourceIP';
        } else if (PERSISTENCE.toLowerCase() === 'sourceipprotocol') {
            return 'SourceIPProtocol';
        } else {
            throw console.error(
                `No protocol could be maped using the current values:
                ${PERSISTENCE}  Values must be one of the following: "Default" | "SourceIP" | "SourceIPProtocol"`,
            );
        }
    }
    // Get the Public IP tied to the front End Config. Required to Update loadbalancer rules.
    public async getFrontEndPublicIP() {
        const getELB = await this.getLoadBalancer();
        if (getELB && getELB.frontendIPConfigurations) {
            for (let item of getELB.frontendIPConfigurations) {
                if (item.name === FRONTEND_IP_NAME) {
                    console.log(`Public IP: ' + ${item.name}, ${item.publicIPAddress.id}`);
                    return item.publicIPAddress.id;
                } else {
                    throw console.error(
                        `Error in getFrontEndPublicIP. No FontEnd Config found with the name
                        ${FRONTEND_IP_NAME}`,
                    );
                }
            }
        } else {
            throw console.error('Error in getFrontEndPublicIP. JSON data could not be retrieved.');
        }
        // Throw an error here or else typescript will complain
        throw console.error('Error in getFrontEndPublicIP. JSON data could not be retrieved.');
    }
    // Returns a list of resource ID's attached to the backendAddress Pool. Required to update LoadBalancing rules.
    public async getbackendIPConfigurationList(): Promise<NetworkManagementModels.NetworkInterfaceIPConfiguration[]> {
        const getELB = await this.getLoadBalancer();
        if (getELB && getELB.backendAddressPools) {
            for (let item of getELB.backendAddressPools) {
                if (item.name === BACKEND_POOL_NAME) {
                    console.log(`Backend Pool Name: ${item.name}, ${item.backendIPConfigurations}`);
                    return item.backendIPConfigurations;
                } else {
                    throw console.error(`Error in getFrontEndPublicIP.
                    No FontEnd Config found with the name  ${FRONTEND_IP_NAME}`);
                }
            }
        } else {
            throw console.error('Error in getFrontEndPublicIP. JSON data could not be retrieved.');
        }
        // Throw an error here or else typescript will complain
        throw console.error('Error in getFrontEndPublicIP. JSON data could not be retrieved.');
    }

    // Get the Port tied to the probe. Required to Create/Update loadbalancer rules.
    public async getProbePort(): Promise<number> {
        const getELB = await this.getLoadBalancer();

        if (getELB && getELB.probes) {
            for (let item of getELB.probes) {
                if (item.name === PROBE_NAME) {
                    console.log(`Probe: ${item.name}, ${item.port}`);
                    return item.port;
                } else {
                    throw console.error(
                        `Error in getProbePort. No probe found with the name ${PROBE_NAME}`,
                    );
                }
            }
        } else {
            throw console.error('Error in getProbePort. Probes data could not be retrieved.');
        }
        // Throw an error here or else typescript will complain
        throw console.error('Error in getProbePort. Probes data could not be retrieved.');
    }
    // Get the Protocol tied to the probe. Required by the type, but the API call will work without this.
    public async getProbeProtocol(): Promise<NetworkManagementModels.ProbeProtocol> {
        const getELB = await this.getLoadBalancer();
        if (getELB && getELB.probes) {
            console.log(getELB.probes)
            for (let item of getELB.probes) {
                if (item.name === PROBE_NAME) {
                    console.log(`Probe: ${item.name}, ${item.protocol}`);
                    return item.protocol;
                } else {
                    throw console.error(
                        `Error in getProbeProtocol. No probe found with the name ${PROBE_NAME}`,
                    );
                }
            }
        } else {
            throw console.error('Error in getProbeProtocol. Probes data could not be retrieved.');
        }
        // Throw an error here or else typescript will complain
        throw console.error('Error in getProbeProtocol. Probes data could not be retrieved.');
    }

    public range(size: number, startAt: number): ReadonlyArray<number> {
        return [...Array(size).keys()].map((i) => i + startAt);
    }

    public splitURL(indexItem): string {
        var lastindex = indexItem.lastIndexOf('/');
        var result = indexItem.substring(lastindex + 1);
        return result;
    }
    // Promise<string[]>
    public async buildLoadBalancerParameters(): Promise<Models.LoadBalancingRule[]> {
        console.log(`Session Persistence type: ${PERSISTENCE}`);
        var parameters;
        try {
            var vipStringList: any = await this.getFortiGateVIPs();
            var vipJSONList = vipStringList;
        } catch (err) {
            console.log(`Error fetching JSON List in buildLoadBalancerParameters : ${err}`);
            throw err;
        }
        // Add parameters here to Loadbalancing rules push
        // to addPortToExternalLoadBalancer as a list and add all at once.
        var loadBalancingRules = [];
        var portsAddedTCP = [];
        var portsAddedUDP = [];
        if (vipJSONList && vipJSONList.results) {
            var persistence = this.getMappedloadDistribution();
            for (let vipList of vipJSONList.results) {
                if (parseInt(vipList.extport, 10) === 0 || parseInt(vipList.mappedport, 10) === 0) {
                    console.log(`External and Backend Ports of 0 are not supported.
                     (Make sure PortForwarding is enabled). Skipping Rule: ${vipList.name}`);
                    // Check if a range is present in the external port range.
                } else if (vipList.extport.includes('-')) {
                    var splitPortRange = vipList.extport.split('-');
                    let getRange = this.range(
                        parseInt(splitPortRange[1]) - parseInt(splitPortRange[0]) + 1,
                        parseInt(splitPortRange[0]),
                    );

                    for (var port in getRange) {
                        var mappedProtocol = this.getMappedProtocol(vipList.protocol);
                        //
                        // Check for overlapping ports.If no check is done the entire update request will be dropped.
                        // Overlapping ports with different protocols are supported.(UDP/TCP)
                        // Each port is added to a respective list. portsAddedTCP or portsAddedUDP
                        // This reducces the complexity of iterating over an ever increasing list of objects.
                        //
                        if (mappedProtocol === 'Tcp' && portsAddedTCP.includes(getRange[port])) {
                            console.log(
                                `Overlapping Port Ranges not supported. Dropping:
                                ${vipList.name}
                                ${mappedProtocol}`,
                            );
                            break;
                        } else if (
                            mappedProtocol === 'Udp' &&
                            portsAddedUDP.includes(getRange[port])
                        ) {
                            console.log(
                                `Overlapping Port Ranges not supported. Dropping:
                                ${vipList.name}, ${mappedProtocol}`,
                            );
                            break;
                        } else if (mappedProtocol === null) {
                            console.log(
                                `Unsupported Protocol Dropping VIP rule:
                                ${vipList.name}, ${mappedProtocol}`,
                            );
                            break;
                        } else {
                            parameters = {
                                protocol: mappedProtocol,
                                loadDistribution: persistence,
                                frontendIPConfiguration: {
                                    id: CONSTRUCTED_FRONTEND_URL,
                                },
                                backendAddressPool: { id: CONSTRUCTED_BACKEND_URL },
                                probe: { id: CONSTRUCTED_PROBE_URL },
                                frontendPort: getRange[port],
                                backendPort: getRange[port],
                                name: `${vipList.name}-${port}`,
                            };

                            if (mappedProtocol === 'Tcp') {
                                portsAddedTCP.push(getRange[port]);
                            } else if (mappedProtocol === 'Udp') {
                                portsAddedUDP.push(getRange[port]);
                            }

                            loadBalancingRules.push(parameters);
                        }
                    }
                } else {
                    var mappedProtocol = this.getMappedProtocol(vipList.protocol);
                    if (
                        mappedProtocol === 'Tcp' &&
                        portsAddedTCP.includes(parseInt(vipList.extport, 10))
                    ) {
                        console.log(
                            `Overlapping Port Ranges not supported. Dropping:
                                ${vipList.name}, ${mappedProtocol}`,
                        );
                        break;
                    } else if (
                        mappedProtocol === 'Udp' &&
                        portsAddedUDP.includes(parseInt(vipList.extport, 10))
                    ) {
                        console.log(
                            `Overlapping Port Ranges not supported. Dropping:
                            ${vipList.name}, ${mappedProtocol}`,
                        );
                        break;
                    } else if (mappedProtocol === null) {
                        console.log(
                            `Unsupported Protocol Dropping VIP rule:
                            ${vipList.name}, ${mappedProtocol}`,
                        );
                        break;
                    } else {
                        parameters = {
                            protocol: mappedProtocol,
                            loadDistribution: persistence,
                            frontendIPConfiguration: {
                                id: CONSTRUCTED_FRONTEND_URL,
                            },
                            backendAddressPool: { id: CONSTRUCTED_BACKEND_URL },
                            probe: { id: CONSTRUCTED_PROBE_URL },
                            frontendPort: parseInt(vipList.extport, 10),
                            backendPort: parseInt(vipList.mappedport, 10),
                            name: vipList.name,
                        };
                        loadBalancingRules.push(parameters);

                        if (mappedProtocol === 'Tcp') {
                            portsAddedTCP.push(parseInt(vipList.extport, 10));
                        } else if (mappedProtocol === 'Udp') {
                            portsAddedUDP.push(parseInt(vipList.extport, 10));
                        }
                    }
                }
            }
            return loadBalancingRules;
        }
        throw console.error(
            'Error in buildLoadBalancerParameters. Data from fortigate Not present',
        );
    }
    public async addPortToExternalLoadBalancer(): Promise<void> {
        var probePort: number = await this.getProbePort();
        var publicIP: string = await this.getFrontEndPublicIP();
        var probeProtocol: NetworkManagementModels.ProbeProtocol = await this.getProbeProtocol();
        var backendIPconfig: NetworkManagementModels.NetworkInterfaceIPConfiguration[] = await this.getbackendIPConfigurationList();
        var getloadBalancingRules: Models.LoadBalancingRule[] = await this.buildLoadBalancerParameters();

        const parameters: Models.LoadBalancer = {
            location: LOCATION,
            frontendIPConfigurations: [
                {
                    id: CONSTRUCTED_FRONTEND_URL,
                    publicIPAddress: {
                        id: publicIP,
                    },
                    name: FRONTEND_IP_NAME,
                },
            ],
            backendAddressPools: [
                {
                    id: CONSTRUCTED_BACKEND_URL,
                    backendIPConfigurations:

                        backendIPconfig,


                    name: BACKEND_POOL_NAME,
                },
            ],
            probes: [
                {
                    id: CONSTRUCTED_PROBE_URL,
                    port: probePort,
                    name: PROBE_NAME,
                    protocol: probeProtocol,
                },
            ],
            loadBalancingRules: getloadBalancingRules,
        };
        if (SHOW_PARAMETERS_IN_LOG && SHOW_PARAMETERS_IN_LOG.toLowerCase() !== 'false') {
            console.log(
                '*******************************PARAMETERS*********************************************',
            );
            console.log(parameters);
            console.log(
                '**********************************END*************************************************',
            );
        }
        try {
            console.log('Updating Load Balancer rules');
            await client.loadBalancers.createOrUpdate(
                RESOURCE_GROUP_NAME,
                LOADBALANCER_NAME,
                parameters,
            );
        } catch (err) {
            console.log(`Error: ${err}`);
            throw err;
        }
    }
}

if (module === require.main) {
    exports.main(console.log);
}
