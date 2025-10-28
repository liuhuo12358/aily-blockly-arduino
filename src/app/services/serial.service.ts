import { Injectable } from '@angular/core';
import { ElectronService } from './electron.service';

@Injectable({
  providedIn: 'root'
})
export class SerialService {

  // 编译上传时，通过这里获取串口
  currentPort;

  constructor(
    private electronService: ElectronService
  ) { }

  // 此处还未考虑linux、macos适配
  async getSerialPorts(): Promise<PortItem[]> {
    if (this.electronService.isElectron) {
      const currentSerialPortList = await window['SerialPort'].list();
      
      console.log('currentSerialPortList', currentSerialPortList);

      let serialList: PortItem[] = [];

      if (window['platform'].isWindows) {
        serialList = currentSerialPortList.map((item) => {
          let friendlyName: string = item.friendlyName.replace(/ \(COM\d+\)$/, '');
          let keywords = ["蓝牙", "ble", "bluetooth"];
        let icon: string = keywords.some(keyword => item.friendlyName.toLowerCase().includes(keyword.toLowerCase())) ? "fa-light fa-bluetooth" : 'fa-light fa-usb-drive';
        return {
          name: item.path,
          text: friendlyName,
          type: 'serial',
          icon: icon,
        }
      });
      } else if (window['platform'].isMacOS) {
        // 只返回usb串口设备
        serialList = currentSerialPortList.map((item) => {
          let friendlyName: string = item.manufacturer? item.manufacturer : item.path.replace('/dev/tty.usbserial-', '').replace('/dev/cu.usbserial-', '');
          let keywords = ["usb", "serial", "uart", "ftdi", "ch340", "cp210x"];
          let icon: string = keywords.some(keyword => item.path.toLowerCase().includes(keyword.toLowerCase())) ? "fa-light fa-usb-drive" : 'fa-light fa-computer';
          return {
            name: item.path,
            text: friendlyName,
            type: 'serial',
            icon: icon,
          }
        });
      } else if (window['platform'].isLinux) {
        //
      }

      console.log('serialList', serialList);
      
      return serialList;
    } else {
      const port = await navigator['serial'].requestPort();
      return [{ port: port, name: '' }];
    }
  }
}


export interface PortItem {
  port?: string,
  name?: string,
  text?: string,
  type?: string,
  icon?: string,
  disabled?: boolean
}
