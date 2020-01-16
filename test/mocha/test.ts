// tslint:disable: no-unused-expression
// Mocha tests for SLB sync
// Mostly requries FortiGate and SLB setup to be active
// Best used against an operating test suite.
import axios from 'axios';
import https from 'https';
import { AddLoadBalancerPort } from '../../index'
import * as Models from '@azure/arm-network/src/models';
import * as msRestNodeAuth from '@azure/ms-rest-nodeauth';
import {
    NetworkManagementClient,
    NetworkManagementModels,
} from '@azure/arm-network';
import * as msRest from '@azure/ms-rest-js';
import chai = require('chai');
import 'mocha';


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
} = process.env;
var PERSISTENCE = process.env.PERSISTENCE
var should = chai.should();
var assert = chai.assert;
var expect = chai.expect;
var client: any;
var loadBalancerTest = new AddLoadBalancerPort(client);
var getLoadBalancerTest;

before(async function () {
    var credentials: any;
    credentials = await msRestNodeAuth.loginWithServicePrincipalSecret(
        REST_APP_ID,
        REST_APP_SECRET,
        TENANT_ID,
    );
    client = new NetworkManagementClient(credentials, SUBSCRIPTION_ID);
    loadBalancerTest = new AddLoadBalancerPort(client);
    getLoadBalancerTest = await loadBalancerTest.getLoadBalancer();
});
/********** Unit Tests *********
* Should work without any setup.
*/

describe('#getMappedProtocol()', function () {
    it('responds with matching records', function () {
        loadBalancerTest.getMappedProtocol('udp').should.equal('Udp');
        loadBalancerTest.getMappedProtocol('tcp').should.equal('Tcp');
        expect(loadBalancerTest.getMappedProtocol('icmp')).to.be.a('null');
        expect(loadBalancerTest.getMappedProtocol('sctp')).to.be.a('null');
        expect(loadBalancerTest.getMappedProtocol('xxx')).to.be.a('null');
    });
});
describe('#getFrontEndPorts()', function () {
    it('responds with matching records', function () {
        loadBalancerTest.getFrontEndPorts({ frontendPort: 25 }).should.equal(25);
        loadBalancerTest.getFrontEndPorts({ frontendPort: 50 }).should.equal(50);
    });
});
describe('#getBackendPorts()', function () {
    it('responds with matching records', function () {
        loadBalancerTest.getBackendPorts({ backendPort: 25 }).should.equal(25);
        loadBalancerTest.getBackendPorts({ backendPort: 50 }).should.equal(50);
    });

});
describe('#splitURL()', function () {
    it('Returns a string with eveerything after the last slash.', function () {
        loadBalancerTest.splitURL('test/123').should.equal('123');
        loadBalancerTest.splitURL('/lots/of//slahses/////333').should.equal('333');
    });

});

/********** Functional Unit Tests **********
* Requires FortiGate and SLB to be set up to work.
* Tests each function locally
*/

describe('#getLoadBalancer()', async function () {
    describe('#getLoadBalancer()', function () {
        it('responds with matching records', function () {
            expect(getLoadBalancerTest).to.not.be.empty;
            // Must have ALL keys or else it fails. Additional keys will also cause a fail
            expect(getLoadBalancerTest).to.have.all.keys(
                'backendAddressPools',
                'etag',
                'frontendIPConfigurations',
                'id',
                'inboundNatPools',
                'inboundNatRules',
                'loadBalancingRules',
                'location',
                'name',
                'probes',
                'provisioningState',
                'resourceGuid',
                'sku',
                'type'
            );

        });
    });
    describe('#getLoadBalancer()', function () {
        it('gets Ip config for FrontEnd SLB', async function () {
            var getfrontendIPConfigurationsTest = await loadBalancerTest.getfrontendIPConfigurations();
            expect(getfrontendIPConfigurationsTest).to.not.be.empty;
            // expect(getLoadBalancerTest).to.have.any.keys('frontendIPConfiguration');

        });
    });
    describe('#getLoadBalancerPorts()', function () {
        it('getLoadBalancerPorts', async function () {
            var getLoadBalancerPortsTest = await loadBalancerTest.getLoadBalancerPorts();
            // expect(getLoadBalancerPorts).to.not.be.empty;
            expect(getLoadBalancerPortsTest).to.be.a('array');

        });
    });
    describe('#getFortiGateVIPs()', function () {
        it('getFortiGateVIPs', async function () {
            var getFortiGateVIPsTest = await loadBalancerTest.getFortiGateVIPs();
            // expect(getLoadBalancerPorts).to.not.be.empty;
            expect(getFortiGateVIPsTest).to.be.a('object');
        });
    });
    describe('#getMappedloadDistribution', function () {
        it('getMappedloadDistribution', async function () {
            expect(loadBalancerTest.getMappedloadDistribution()).to.be.a('string');
        });
    });
    describe('#getProbeProtocol', function () {
        it('Returns health probe data from SLB', async function () {
            var getFortiGateVIPsTest = await loadBalancerTest.getProbeProtocol();
            expect(getFortiGateVIPsTest).to.be.a('string');
        });
    });
    describe('#buildLoadBalancerParameters', function () {
        it('Builds the SLB rules', async function () {
            var buildLoadBalancerParametersTest = await loadBalancerTest.buildLoadBalancerParameters();
            expect(buildLoadBalancerParametersTest).to.be.a('array');
        });
    });
    describe('#addPortToExternalLoadBalancer', function () {
        it('Uploads Parameters to Azure', async function () {
            var addPortToExternalLoadBalancerTest = await loadBalancerTest.addPortToExternalLoadBalancer();
            expect(addPortToExternalLoadBalancerTest).to.be.not.Throw()
        });
    });
});
