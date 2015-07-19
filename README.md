# Usage

`flux.ts`:

```ts
import {
    createAll,
    runFlux as _runFlux,
    IStore as _IStore,
    IAction as _IAction,
    IFlux as _IFlux,
    IFluxProps as _IFluxProps,
} from 'tsflux/index';

import * as React from 'react';
import { ActionType } from './actions';

import { Map, fromJS } from 'immutable';
import { EventEmitter } from 'events';
import { Dispatcher as FluxDispatcher } from 'flux';

export type IState = Map<string, any>;

export type IAction = _IAction<ActionType>;
export type IStore<StoreState> = _IStore<ActionType, StoreState, IState>;
export type IFlux = _IFlux<ActionType, IState>;
export type IFluxProps = _IFluxProps<ActionType>;

let { Connector, connect, Provider } = createAll<ActionType, IState>(React, fromJS);
export { Connector, connect, Provider };

export function runFlux(stores, initialState): IFlux {
    let ds = new FluxDispatcher();
    let events = new EventEmitter();

    return _runFlux<ActionType, IState>(stores, initialState, ds, events, fromJS);
}
```

`index.ts`:

```ts
import { runFlux } from './flux';

let stores = [/* ... */];
let initialState = {/* */};

let flux = runFlux(stores, initialState);

React.render(<Provider flux={flux}>{() => <App />}</Provider>,
    document.getElementById('__rwf-app'));
```

## How to build

Just build your project with [awesome-typescript-loader](https://github.com/s-panferov/awesome-typescript-loader) with `rewriteImports` setting.
