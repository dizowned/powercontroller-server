interface controller {
  id: number;
  name: string;
  url: string;
  channels: { [key: string]: boolean };
}

export default controller;