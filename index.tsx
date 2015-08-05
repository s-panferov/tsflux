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

export interface Flux<ActionType, State> {
    events: EventEmitter,
    dispatch: Dispatch<ActionType>,
    getState(): State
}

export interface StateSlices<State> {
    currentState: State,
    prevState: State
}

export interface Store<ActionType, StoreState, State> {
    name: string
    (state: StoreState, action: Action<ActionType>,
        flux: Flux<ActionType, State>, states?: StateSlices<State>): StoreState
}

export function runFlux<ActionType, State>(stores: Store<ActionType, any, State>[],
                           initialState: any,
                           ds: Dispatcher<ActionType>,
                           events: EventEmitter,
                           fromJS: (obj: any) => any)
    : Flux<ActionType, State> {

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

    let flux: Flux<ActionType, State> = { events, dispatch, getState };

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

    state = fromJS(initialState);

    return flux;
}

export interface ProviderProps<ActionType, State> extends __React.DOMAttributes {
    flux: Flux<ActionType, State>
}

export interface ConnectorProps<ComponentState, State> extends __React.DOMAttributes {
    selector: (componentState: ComponentState, newAppState: State) => ComponentState;
    renderer: (props: any) => __React.ReactElement<any>;
}

export interface ConnectorState<ComponentState> {
    data: ComponentState
}

export interface ConnectorContext<ActionType, State> {
    flux: Flux<ActionType, State>
}

export function getDisplayName(Component) {
    return Component.displayName || Component.name || 'Component';
}

export interface FluxProps<T> {
    dispatch?: Dispatch<T>
}

export function createAll<ActionType, State>(React: typeof __React, fromJS: (o: any) => any) {
    class Provider extends React.Component<ProviderProps<ActionType, State>, any> {
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

    class Connector<ComponentState> extends React.Component<ConnectorProps<ActionType, State>, ConnectorState<ComponentState>> {

        static contextTypes = {
            flux: React.PropTypes.object.isRequired
        };

        context: ConnectorContext<ActionType, State>

        constructor(props: ConnectorProps<ActionType, State>, context: ConnectorContext<ActionType, State>) {
            super(props, context);
            this.state = { data: fromJS({}) };
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
            const { flux: { dispatch } } = this.context;

            return renderer({ dispatch, data });
        }
    }

    function connect(selector) {
        return (DecoratedComponent) => {
            return class ConnectorDecorator extends React.Component<any, any> {
                static displayName = `Connector(${getDisplayName(DecoratedComponent)})`;
                static DecoratedComponent = DecoratedComponent;

                render() {
                    let inner = (props) => <DecoratedComponent {...props} {...this.props} />;
                    return (
                        <Connector selector={selector} renderer={ inner } />
                    );
                }
            } as any;
        }
    };

    return { Provider, Connector, connect }
}
