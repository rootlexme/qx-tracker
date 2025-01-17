import { Report, Options, DefaultOptions } from "../types";
import { sendBeacon, createStringSizeCalculation, log } from "../utils";
import { TrackerOptions, LocationTracker, DomTracker, ErrorTracker, PerformanceTracker } from "./tracker";

export default class Tracker extends TrackerOptions {
  private report: Report = {} // 暂存上报数据
  private locationTracker: LocationTracker | undefined = undefined
  private domTracker: DomTracker | undefined = undefined
  private errorTracker: ErrorTracker | undefined = undefined
  private performanceTracker: PerformanceTracker | undefined = undefined
  private stringSizeCalculation: Function | undefined = undefined
  private beforeCloseHandler: EventListenerOrEventListenerObject | undefined = undefined
  public isDestroy: boolean = false

  constructor(options: Options) {
    super(options);
    // 创建各种Tracker的实例，将配置和上报方法传入
    this.locationTracker = new LocationTracker(this.options, <T>(data: T, key: string) => this.reportTracker(data, key));
    this.domTracker = new DomTracker(this.options, <T>(data: T, key: string) => this.reportTracker(data, key));
    this.errorTracker = new ErrorTracker(this.options, <T>(data: T, key: string) => this.reportTracker(data, key));
    this.performanceTracker = new PerformanceTracker(this.options, <T>(data: T, key: string) => this.reportTracker(data, key));
    this.init();
  }
  // 初始化设置，并且初始化监听事件
  private init() {
    try {
      this.locationTracker?.init();
      this.domTracker?.init();
      this.errorTracker?.init();
      this.performanceTracker?.init();
      if (!this.options.realTime) {
        this.stringSizeCalculation = createStringSizeCalculation();
        this.beforeCloseReport();
      }
      this.options.log && console.log('Tracker is OK');
    } catch (e) {
      // console.log(e);
      sendBeacon(this.options.requestUrl, this.decorateData({
        targetKey: "tracker",
        event: "error",
        message: e,
      }));
      this.options.log && console.error('Tracker is error');
    }
  }
  // 修饰数据，加上统一信息
  private decorateData<T>(data: T): object {
    return Object.assign({}, {
      uuid: this.options.uuid,
      time: new Date().getTime(),
      location: this.locationTracker?.getLocation(),
      extra: this.options.extra,
    }, data);
  }
  // 上报
  private reportTracker<T>(data: T, key: string): boolean {
    const params = this.decorateData(data);
    if (this.options.realTime) {
      return sendBeacon(this.options.requestUrl, params);
    } else {
      const size = this.stringSizeCalculation && this.stringSizeCalculation(JSON.stringify(this.report))
      if (this.options.maxSize && size && size > (this.options.maxSize || 10000)) {
        this.sendReport();
      }
      log && log(size, params); // 打印上报数据,方便调试
      !this.report.hasOwnProperty(key) && (this.report[key] = []);
      this.report[key].push(params);
      return true;
    }
  }
  private beforeCloseReport() {
    this.beforeCloseHandler = () => {
      this.sendReport();
    }
    window.addEventListener("beforeunload", this.beforeCloseHandler);
  }
  // 允许外部设置uuid
  public setUserID<T extends DefaultOptions['uuid']>(uuid: T) {
    if (this.isDestroy) return;
    this.options.uuid = uuid;
  }
  // 外部设置额外参数
  public setExtra<T extends DefaultOptions['extra']>(extra: T) {
    if (this.isDestroy) return;
    this.options.extra = extra;
  }
  // 主动上报
  public sendTracker<T>(targetKey: string = 'manual', data?: T) {
    if (this.isDestroy) return;
    this.reportTracker({
      event: 'manual',
      targetKey,
      data,
    }, 'manual')
  }
  // 手动发送非实时上报模式下累积的数据，用户可以在合适的时候上报数据
  public sendReport(): boolean {
    if (this.isDestroy) return false;
    const state = sendBeacon(this.options.requestUrl, this.report);
    state && (this.report = {});
    return state
  }
  // 销毁
  public destroy() {
    if (this.isDestroy) return;
    // 销毁前把数据传出
    this.sendReport();
    this.locationTracker?.destroy();
    this.domTracker?.destroy();
    this.errorTracker?.destroy();
    this.performanceTracker?.destroy();
    this.beforeCloseHandler && window.removeEventListener("beforeunload", this.beforeCloseHandler);
    this.locationTracker = undefined;
    this.domTracker = undefined;
    this.errorTracker = undefined;
    this.performanceTracker = undefined;
    this.stringSizeCalculation = undefined;
    this.beforeCloseHandler = undefined;
    this.isDestroy = true;
  }
}

