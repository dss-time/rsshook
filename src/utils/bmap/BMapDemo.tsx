import { Empty, Modal } from "antd";
import { useEffect, useState } from "react";
import { BMapModule } from "./BMap";
import { v4 as uuidv4 } from "uuid";
const BMap = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    open &&
      BMapModule.initializeMap(
        `mapContainer-${uuidv4}`,
        "121.472644",
        "31.231706"
      );

    return () => {
      BMapModule.destroyMap();
    };
  }, [open]);

  return (
    <>
      <Modal
        title={`Map`}
        width={800}
        open={open}
        onCancel={() => setOpen(false)}
        maskClosable={false}
        footer={false}
        forceRender={true}
        destroyOnClose={true}
      >
        {!navigator.onLine ? (
          <Empty />
        ) : (
          <div
            id={`mapContainer-${uuidv4()}`}
            style={{ width: "100%", height: "300px" }}
          ></div>
        )}
      </Modal>
    </>
  );
};

export default BMap;
