export interface channel{
    name: string; 
    state: boolean; 
    channelNo: number 
}
export interface PowerController {
  id: number;
  name: string;
  url: string;
  channels: channel[];
}
export default PowerController;