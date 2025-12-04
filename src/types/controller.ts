interface PowerController {
  id: number;
  name: string;
  url: string;
  channels: channel[];
}
interface channel{
    name: string; 
    state: boolean; 
    channelNo: number 
}
export default PowerController;