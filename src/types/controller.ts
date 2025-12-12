export interface channel{
  name: string; 
  state: boolean; 
  number: number 
}
export interface PowerController {
  id: number;
  name: string;
  url: string;
  channels: channel[];
}
export default PowerController;