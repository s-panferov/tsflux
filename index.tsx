/*
 * DEPS
 */

export interface EventEmitter {
    emit(name: string, ...args: any[]);
    addListener(name: string, callback: () => void);
    removeListener(name: string, callback: () => void);
}

export interface FluxDispatcher<T> {
    register(foo: (action: T) => void);
    dispatch(action: T): void;
}

export interface Action<T> {
    actionType: T
}

export type Dispatcher<T> = FluxDispatcher<Action<T>>;
export interface Dispatch<T> {
    (action: Action<T>): void
}

export interface Flux<ActionType, State, ActionCreactors, Addons> {
    events: EventEmitter,
    dispatch: Dispatch<ActionType>,
    actions: ActionCreactors,
    getState(): State,
    addons: Addons
}

export interface StateSlices<State> {
    currentState: State,
    prevState: State
}

export interface Store<ActionType, ActionCreators, StoreState, State, Addons> {
    name: string
    (state: StoreState, action: Action<ActionType>,
        flux: Flux<ActionType, State, ActionCreators, Addons>, states?: StateSlices<State>): StoreState
}

export function runFlux<ActionType, ActionCreators, State, Action, Addons>(stores: Store<ActionType, ActionCreators, any, State, Addons>[],
                                           initialState: State,
                                           ds: Dispatcher<ActionType>,
                                           events: EventEmitter,
                                           actionCreators: any,
                                           addons?: Addons
                                )
    : Flux<ActionType, State, ActionCreators, Addons> {

    let dispatch = (action) => {
        console.log('Dispatch', action);
        ds.dispatch(action);
    };

    let state: State;
    let states: StateSlices<State> = {
        currentState: null,
        prevState: null
    };

    function getState() { return state };

    let bindedCreators = {};
    for (var i in actionCreators) {
        if (actionCreators.hasOwnProperty(i)) {
            var item = actionCreators[i];
            (function(i, item) {
                if (typeof item == 'function') {
                    bindedCreators[i] = (...args: any[]) => {
                        console.log('call', i, item)
                        dispatch(item(...args))
                    }
                } else {
                    bindedCreators[i] = item;
                }
            })(i, item)
        }
    }

    let flux: Flux<ActionType, State, ActionCreators, Addons> = {
        events,
        dispatch,
        getState,
        actions: bindedCreators as any,
        addons: addons || {} as any
    };

    // Note: pseudo-store
    ds.register((action) => {
        // 1. Memoize prevState
        states.prevState = state;
    });

    let stateChanged = false;
    stores.forEach((store) => {
        ds.register((action) => {
            let prevStoreState = (state as any).get(store.name);
            let newStoreState = store(prevStoreState, action, flux, states) || prevStoreState;
            if (prevStoreState !== newStoreState) {
                if (!stateChanged) {
                    stateChanged = true;
                }

                console.log('State changed by',
                    '"' + store.name + '" store.\n  ',
                    prevStoreState.toJS(), ' -> ',
                    newStoreState.toJS());

                // Let's calc a new global state
                let newGlobalState = (state as any).set(store.name, newStoreState);

                // New global state is now current
                states.currentState = newGlobalState as any;

                // Update global state var
                state = newGlobalState as any;

                // Fire change event with store's name
                events.emit(store.name, newGlobalState, state);
            }
        });
    });

    // Note: pseudo-store
    ds.register((action) => {
        if (stateChanged) {
            events.emit('change');
            stateChanged = false;
        }
    });

    state = initialState;

    ds.dispatch({ actionType: 'INIT' as any });

    return flux;
}

export interface ProviderProps<ActionType, ActionCreators, State, Addons> extends __React.DOMAttributes {
    flux: Flux<ActionType, State, ActionCreators, Addons>
}

export interface ConnectorProps<ComponentState, State> extends __React.DOMAttributes {
    selector: (componentState: ComponentState, newAppState: State) => any;
    renderer: (props: any) => __React.ReactElement<any>;
    record: any
}

export interface ConnectorState<ComponentState> {
    data: ComponentState
}

export interface ConnectorContext<ActionType, ActionCreators, State, Addons> {
    flux: Flux<ActionType, State, ActionCreators, Addons>
}

export function getDisplayName(Component) {
    return Component.displayName || Component.name || 'Component';
}

export interface FluxProps<T> {
    dispatch?: Dispatch<T>
}

export function createAll<ActionType, ActionCreators, State, Addons>(React: typeof __React, fromJS: (o: any) => any) {
    class Provider extends React.Component<ProviderProps<ActionType, ActionCreators, State, Addons>, any> {
        static childContextTypes = {
            flux: React.PropTypes.object.isRequired
        };

        getChildContext() {
            return { flux: this.props.flux };
        }

        render() {
            const { children } = this.props;
            return (children as any)();
        }
    }

    class Connector<ComponentState> extends React.Component<ConnectorProps<any, State>, ConnectorState<ComponentState>> {

        static contextTypes = {
            flux: React.PropTypes.object.isRequired
        };

        context: ConnectorContext<ActionType, ActionCreators, State, Addons>

        constructor(props: ConnectorProps<ActionType, State>, context: ConnectorContext<ActionType, ActionCreators, State, Addons>) {
            super(props, context);
            this.state = {
                data: this.props.record
                    ? (new this.props.record())
                    : fromJS({})
            };
            this.handleChange = this.handleChange.bind(this);
        }

        componentWillMount() {
            this.context.flux.events.addListener('change', this.handleChange);

            // Extract initial data
            this.handleChange();
        }

        componentWillUnmount() {
            this.context.flux.events.removeListener('change', this.handleChange);
        }

        handleChange() {
            let newAppState = this.context.flux.getState();
            let newData = (this.state.data as any).withMutations(data => this.props.selector(data, newAppState));
            if (this.state.data !== newData) {
                this.setState({
                    data: newData
                });
            }
        }

        render() {
            const { renderer } = this.props;
            const { data } = this.state;
            const { flux: { dispatch, actions } } = this.context;
            const { flux } = this.context;

            return renderer({ dispatch, data, actions, flux });
        }
    }

    function connect<T>(record: { new (arg: any): T } | { (localState: any, appState: State): any }, selector?: (localState: T, appState: State) => any) {
        if (typeof selector === 'undefined') {
            selector = record as any;
            record = null;
        }
        return (DecoratedComponent) => {
            return class ConnectorDecorator extends React.Component<any, any> {
                static displayName = `Connector(${getDisplayName(DecoratedComponent)})`;
                static DecoratedComponent = DecoratedComponent;

                render() {
                    let inner = (props) => <DecoratedComponent {...props} {...this.props} />;
                    return (
                        <Connector selector={selector} record={record} renderer={ inner } />
                    );
                }
            } as any;
        }
    };

    return { Provider, Connector, connect }
}
