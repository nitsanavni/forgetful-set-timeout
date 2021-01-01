import test from "ava";
import { chain, each, fill, max, noop, reduce, times, toNumber } from "lodash";
import { useFakeTimers, spy } from "sinon";

type CB = () => void;
type SetTimeout = (cb: CB, ms: number) => void;

const forgetfulSetTimeout: SetTimeout = (() => {
    let timerId: any;

    return <SetTimeout>((cb, ms) => {
        timerId && clearTimeout(timerId);
        timerId = setTimeout(cb, ms);
    });
})();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const rememberingSetTimeout: SetTimeout = (() => {
    const map: { [key: number]: CB[] } = {};

    return <SetTimeout>((cb, ms) => {
        const key = Date.now() + ms;

        (map[key] ??= []).push(cb);

        const next = () => {
            const nextRelevantTime =
                chain(map).keys().map(toNumber).min().value() - Date.now();

            isFinite(nextRelevantTime) &&
                forgetfulSetTimeout(() => {
                    const keysToCall = chain(map)
                        .keys()
                        .map(toNumber)
                        .filter((t) => t <= Date.now())
                        .value();

                    each(keysToCall, (key) => {
                        each(map[key], (cb) => cb());
                        delete map[key];
                    });

                    next();
                }, max([0, nextRelevantTime])!);
        };

        next();
    });
})();

const atTimes = (map: { [time: number]: CB }): void => {
    const clock = useFakeTimers();

    chain(map)
        .entries()
        .reduce(
            ([previousTime], [time, op]) => {
                clock.tick(+time - +previousTime);
                op();

                return [time, noop];
            },
            ["0", noop]
        )
        .value();

    clock.uninstall();
};

test.serial("more declarative", (t) => {
    const cbs = times(3, () => spy());

    atTimes({
        0: () => {
            rememberingSetTimeout(cbs[0], 20);
            rememberingSetTimeout(cbs[1], 30);
        },
        10: () => {
            t.true(cbs[0].notCalled && cbs[1].notCalled);
            rememberingSetTimeout(cbs[2], 15);
        },
        20: () => t.true(cbs[0].called && cbs[1].notCalled && cbs[2].notCalled),
        25: () => t.true(cbs[0].called && cbs[1].notCalled && cbs[2].called),
        30: () => t.true(cbs[0].called && cbs[1].called && cbs[2].called),
    });
});

test.serial("multiple ticks", (t) => {
    const clock = useFakeTimers();

    const cbs = times(3, () => spy());

    rememberingSetTimeout(cbs[0], 20);
    rememberingSetTimeout(cbs[1], 30);

    clock.tick(10);

    t.true(cbs[0].notCalled && cbs[1].notCalled);

    rememberingSetTimeout(cbs[2], 15);

    clock.tick(10);

    t.true(cbs[0].called && cbs[1].notCalled && cbs[2].notCalled);

    clock.tick(5);

    t.true(cbs[0].called && cbs[1].notCalled && cbs[2].called);

    clock.tick(5);

    t.true(cbs[0].called && cbs[1].called && cbs[2].called);

    clock.uninstall();
});

test.serial("should support later one", (t) => {
    const clock = useFakeTimers();

    t.plan(2);

    rememberingSetTimeout(() => t.true(true), 20);
    rememberingSetTimeout(() => t.true(true), 30);

    clock.tick(40);

    clock.uninstall();
});

test.serial("should support 1 cb", (t) => {
    const clock = useFakeTimers();

    rememberingSetTimeout(() => t.pass(), 30);

    clock.tick(30);

    clock.uninstall();
});

test.serial("scaffolding - forgetfulSetTimeout - with fake timers", (t) => {
    const clock = useFakeTimers();

    t.plan(2);

    forgetfulSetTimeout(() => t.fail(), 3);
    forgetfulSetTimeout(() => t.fail(), 1);
    forgetfulSetTimeout(() => t.fail(), 1);
    forgetfulSetTimeout(() => t.true(true), 2);

    clock.tick(10);

    t.pass();

    clock.uninstall();
});

test.serial("scaffolding - forgetfulSetTimeout", async (t) => {
    t.plan(1);

    forgetfulSetTimeout(() => t.fail(), 3);
    forgetfulSetTimeout(() => t.fail(), 1);
    forgetfulSetTimeout(() => t.fail(), 1);
    forgetfulSetTimeout(() => t.pass(), 1);

    await sleep(2);
});
