# Introduction

ForitGate load-balancer-rule-sync allows you to automatically sync TCP and UDP VIP rules created on your FortiGate to an external load balancer on Azure

# Requirements

- FortiGate with an API key set up.
- Logging must be enabled on the FortiGate.
- External Load Balancer set up.
- A service prinicpal account and secret setup. More info can be found [here](https://docs.microsoft.com/en-us/azure/active-directory/develop/howto-create-service-principal-portal)

# Restrictions

- FortiGate VIPs supports the SCTP and ICMP protocols these are not currently supported in the load blancing rules of an Azure Load balancer and will be dropped with the following error messages:

  `ICMP is not supported in Azure Load Balancers. Pick UDP or TCP in the VIP`

  `SCTP is not supported in Azure Load Balancers. Pick UDP or TCP in the VIP`

- Port Ranges are supported on the FortiGate but not on the Azure Load balancer, these will appear as seperate ports on the load balancer with a dash and number appended to the end of the name.
- Overlapping ranges are allowed in the FortiGate as long as the source ip ranges are different. This feature is not present on the load balancer. The last VIP with an overlapping range will be dropped.
- Port Forwarding must be enabled.

# Set up

1. Set up a premium function app service account.
2. Choose nodejs as the runtime and Windows as the operating system.
3. Copy the code from ./dist/index.js into the function and install the folowing modules via the console:
   npm install @azure/ms-rest-js
   npm install @azure/ms-rest-nodeauth
   npm install @azure/arm-network
   npm install axios
4. Under Application settings add the following:


    REST_APP_ID: Client or App ID.<br>
    REST_APP_SECRET: Password or Secret.<br>
    SUBSCRIPTION_ID: Your Subscription ID.<br>
    TENANT_ID: Domain Or Tenant ID.<br>
    RESOURCE_GROUP_NAME: The Resource Group in which the VMs are located.<br>
    LOADBALANCER_NAME: The external Load balancer name<br>
    FORTIGATE_IP: The IP of your master fortigate<br>
    API_KEY: The API key generated on your fortigate (See The API key for details)<br>
    LOCATION: The region your Load Balancer is in. This necessary to make the Azure API call.<br>
    FRONTEND_IP_NAME: The Frontend IP configuration name attached to your load balancer.<br>
    BACKEND_POOL_NAME: The Backend pool name attached to your load balancer.<br>
    PROBE_NAME: The health probe name attached to your load balancer.<br>

    The following are Optional variables<br>
    INTERFACE : Defaults to all - Allows specification of a single port to monitor for VIP changes. Acceptable inputs are 'all', 'any', '<InterfaceName>'(e.g port1). If a single interface is chosen that interface and all VIPS attached to 'any' interface wil sync. If 'any' is chosen only the vips with 'any interface' will sync.
    To sync all rules from all ports use the keyword 'all'
    REJECT_UNAUTHORIZED_CERTS : Defaults to false. Set to true to only allow CA signed certs.
    SHOW_PAREMETERS_IN_LOG: Defaults to false. If true it will show the load balancer paramters sent to the Azure API in the APP insights logs. Useful for debugging.<br>
    PERSISTENCE: Defaults to **Default**. Acceptable values are : Default | SourceIP | SourceIPProtocol<br>
    RUN_ALWAYS: Defaults to false. If true the function will run the whole process regardless of what data was supplied in the trigger. This is useful for using the Run button in the azure function, Intial set up and debugging.<br>

# The API key

In order to use the script you will need to set up an API key on the FortiGate.

## Create an Administrator profile

1. Log in to your FortiGate.
2. Select **System > Admin Profiles > Create new**.
3. Populate the fields as show in the image:<br>
   ![FortiOS Admin Profile](./imgs/apiprofile_loadbalancer.png)
4. Click **OK**.

## Create the REST API Admin

1. Select **System > Administrators > Create new > REST API Admin**.
2. Use the **Administrtor Profile** you created.
3. Add these **Trusted Hosts**:
   - 36.0.0.0/3
   - 64.0.0.0/2
   - 128.0.0.0/1
   - 23.0.0.0/8
   - 24.0.0.0/8
   - 13.0.0.0/8
     > **Note:** The 0.0.0.0/0 range is not supported. A call may come from many different AWS IP addresses. A full list of Azure ranges is available [here](https://docs.microsoft.com/en-us/azure/azure-functions/ip-addresses).
4. Click **OK**.

## Create the triggers on the FortiGate

Two automation triggers must be created on the FortiGate. One which uses the Object configured FortiOS event to tell if a VIP has been removed and a second which uses the Object Attribute configured FortiOS event to tell if an object has been created or changed.

Both events will trigger a call to the function once a VIP has been Created, Modfied or deleted.

In addition the function environment variable: ALWAYS_RUN may be set to true to allow any function call to run the function code.

To create the Delete Trigger :

1. Select Security Fabric > Automation.
2. Click Create New.
3. Enter a Name for the Automation Stitch.
4. Under Trigger, select FortiOS Event Log.
5. Under Event select **Object configured**
6. Under Action, select Azure Function.
   Set the Azure Function parameters, with the API gateway and the settings generated in the previous section.

See the following example for details:

![FortiOS Admin Profile](./imgs/objectdeletetrigger.png)

To create the Object Change Trigger :

1. Select Security Fabric > Automation.
2. Click Create New.
3. Enter a Name for the Automation Stitch.
4. Under Trigger, select FortiOS Event Log.
5. Under Event select **Object attribute configured**
6. Under Action, select Azure Function.
   Set the Azure Function parameters, with the API gateway and the settings generated in the previous section.

   See the following example for details:

![FortiOS Admin Profile](./imgs/objectchangestitch.png)

# Usage

After setting up the Function and FortiGate, you can start creating VIP's on the FortiGate and they will populate to the External Load Balancer in Azure.

# Troubleshooting

Logging information can be found in App insights if enabled.

The following are potential errors that may be returned by the FortiGate:

- 400 : Bad Request: Request cannot be processed by the AP
- 401 : Not Authorized: Request without successful login session
- 403 : Forbidden: Request is missing CSRF token or administrator is missing access profile permissions.
- 404 : Resource Not Found: Unable to find the specified resource.
- 405 : Method Not Allowed: Specified HTTP method is not allowed for this resource.
- 424 : Failed Dependency: Fail dependency can be duplicate resource, missing required parameter, missing required attribute, invalid attribute value.

Further troubleshooting can be done by logging into the FortiGate via `ssh` and entering the following commands:

```
diagnose debug enable

diagnose debug application httpsd -1
```

This will print debugging information when an API request is made.

# Support

Fortinet-provided scripts in this and other GitHub projects do not fall under the regular Fortinet technical support scope and are not supported by FortiCare Support Services.
For direct issues, please refer to the [Issues](https://github.com/fortinet/azure-security-group-update/issues) tab of this GitHub project.
For other questions related to this project, contact [github@fortinet.com](mailto:github@fortinet.com).

## License

[License](./LICENSE) © Fortinet Technologies. All rights reserved.
