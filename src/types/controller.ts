interface PowerController {
  id: number;
  name: string;
  url: string;
  channels: { [name: string]: { state: boolean; channelNo: number } };
}

export default PowerController;