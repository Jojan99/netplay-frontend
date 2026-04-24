import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';

interface ConnectedDevice {
  name: string;
  ip: string;
  mac: string;
  band: '2.4 GHz' | '5 GHz' | 'Cable';
  status: 'Conectado' | 'Inactivo';
}

@Component({
  selector: 'app-ont-device',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './ont-device.component.html'
})
export class OntDeviceComponent implements OnInit {

deviceId="00259E-HG8145X6-10-48575443E540CBAF";

showPass24=false;
showPass5=false;

ont:any={
status:false,
serial:"",
model:"",
manufacturer:"",
firmware:"",
cpu:"",
memory:"",
wanIp:"",
uptime:"",
lastInform:"",
traffic:0,
rxPower:"--",
txPower:"--",
temperature:"--",

wifi24:{
ssid:"",
password:""
},

wifi5:{
ssid:"",
password:""
}

}

devices:any[]=[];

constructor(private http:HttpClient){}

ngOnInit(){
this.loadOnt();
}

loadOnt() {

    const url =
    'http://181.48.150.43:7557/devices?query=%7B%22InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress._value%22:%22192.168.104.7%22%7D';

    this.http.get<any>(url).subscribe(res => {


const device=res[0];

console.log("ONT DATA:",device);

this.ont.serial=device._deviceId?._SerialNumber;
this.ont.model=device._deviceId?._ProductClass;
this.ont.manufacturer=device._deviceId?._Manufacturer;

this.ont.lastInform=device._lastInform;

this.ont.uptime=
device.InternetGatewayDevice?.DeviceInfo?.UpTime?._value;

this.ont.wanIp=
device.InternetGatewayDevice?.WANDevice?.["1"]
?.WANConnectionDevice?.["1"]
?.WANIPConnection?.["1"]
?.ExternalIPAddress?._value;

this.loadWifi(device);
this.loadHosts(device);
this.loadOptical(device);
this.loadTraffic(device);

});
}
loadWifi(device:any){

this.ont.wifi24.ssid=
device.InternetGatewayDevice?.LANDevice?.["1"]
?.WLANConfiguration?.["1"]
?.SSID?._value;

this.ont.wifi24.password=
device.InternetGatewayDevice?.LANDevice?.["1"]
?.WLANConfiguration?.["1"]
?.PreSharedKey?.["1"]?.KeyPassphrase?._value;

this.ont.wifi5.ssid=
device.InternetGatewayDevice?.LANDevice?.["1"]
?.WLANConfiguration?.["5"]
?.SSID?._value;

this.ont.wifi5.password=
device.InternetGatewayDevice?.LANDevice?.["1"]
?.WLANConfiguration?.["5"]
?.PreSharedKey?.["1"]?.KeyPassphrase?._value;

}

loadHosts(device:any){

const hosts=
device.InternetGatewayDevice?.LANDevice?.["1"]
?.Hosts?.Host;

if(!hosts)return;

this.devices=Object.values(hosts).map((h:any)=>({

name:h.HostName?._value || "Unknown",

ip:h.IPAddress?._value,

mac:h.MACAddress?._value,

band:"WiFi",

status:h.Active?._value ? "Conectado":"Inactivo"

}));

}

loadOptical(device:any){

this.ont.rxPower=
device.InternetGatewayDevice?.WANDevice?.["1"]
?.X_HW_PonQualityMonitor?.RXPower?._value;

this.ont.txPower=
device.InternetGatewayDevice?.WANDevice?.["1"]
?.X_HW_PonQualityMonitor?.TXPower?._value;

this.ont.temperature=
device.InternetGatewayDevice?.WANDevice?.["1"]
?.X_HW_PonQualityMonitor?.Temperature?._value;

}

loadTraffic(device:any){

const sent=
device.InternetGatewayDevice?.WANDevice?.["1"]
?.WANConnectionDevice?.["1"]
?.WANIPConnection?.["1"]
?.BytesSent?._value;

const received=
device.InternetGatewayDevice?.WANDevice?.["1"]
?.WANConnectionDevice?.["1"]
?.WANIPConnection?.["1"]
?.BytesReceived?._value;

if(sent && received){

const total=(Number(sent)+Number(received));

this.ont.traffic=(total/1024/1024/1024).toFixed(2);

}

}

refreshOnt(){

this.http.post(
"http://181.48.150.43:7557/devices/"+this.deviceId+"/tasks",
{
name:"refreshObject",
objectName:"InternetGatewayDevice"
}
).subscribe(()=>{

setTimeout(()=>this.loadOnt(),2000)

});

}

rebootOnt(){

this.http.post(
"http://181.48.150.43:7557/devices/"+this.deviceId+"/tasks",
{
name:"reboot"
}).subscribe();

}

editWifi(band:string){

let parameter="";

if(band=="2.4")
parameter="InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase";

if(band=="5")
parameter="InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.KeyPassphrase";

const password=prompt("Nueva contraseña WiFi");

if(!password)return;

this.http.post(
"http://181.48.150.43:7557/devices/"+this.deviceId+"/tasks",
{
name:"setParameterValues",
parameterValues:[
[parameter,password,"xsd:string"]
]
}).subscribe();

}

toggle24(){
this.showPass24=!this.showPass24;
}

toggle5(){
this.showPass5=!this.showPass5;
}

copyText(text:string){

navigator.clipboard.writeText(text);

}

getConnectedCount(){

return this.devices.filter(d=>d.status=="Conectado").length;

}

}