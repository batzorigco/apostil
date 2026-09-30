import message from "../assets/sidebar/message.svg";
import refresh from "../assets/sidebar/refresh.svg";
import close from "../assets/sidebar/close.svg";
import file from "../assets/sidebar/file.svg";
import globe from "../assets/sidebar/globe.svg";
import chevron from "../assets/sidebar/chevron.svg";
import unread from "../assets/sidebar/chevron-unread.svg";
import expanded from "../assets/sidebar/chevron-expanded.svg";
import send from "../assets/sidebar/send.svg";

const icons = { message, refresh, close, file, globe, chevron, "chevron-unread": unread, "chevron-expanded": expanded, send };
export function SidebarIcon({ name }: { name: keyof typeof icons }) {
  return <img className="apostil-design-icon" src={icons[name]} alt="" aria-hidden="true" draggable={false} />;
}
